/**
 * StockMind — API Gateway (aplicación Express)
 * ==============================================
 * Construye la aplicación SIN ponerla a escuchar, para poder probarla.
 * server.js la arranca.
 *
 * Responsabilidades:
 * - Punto de entrada único para el frontend
 * - Verificación centralizada de tokens JWT (vía cookie httpOnly)
 * - Enrutamiento hacia Java Spring Boot (lógica de negocio) y Python Flask (analítica)
 * - Seguridad: cabeceras (helmet), CORS, límites de tamaño, rate limiting, timeouts
 * - Registro estructurado de peticiones (JSON por salida estándar)
 */
require('dotenv').config();
const crypto = require('node:crypto');
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const pino = require('pino');
const pinoHttp = require('pino-http');

// Validación temprana: sin JWT_SECRET válido el gateway no debe ni construirse
require('./src/config/config');

const authRoutes = require('./src/routes/auth.routes');
const productRoutes = require('./src/routes/products.routes');
const inventoryRoutes = require('./src/routes/inventory.routes');
const salesRoutes = require('./src/routes/sales.routes');
const userRoutes = require('./src/routes/users.routes');
const reportRoutes = require('./src/routes/reports.routes');
const predictionRoutes = require('./src/routes/predictions.routes');
const agentRoutes = require('./src/routes/agent.routes');
const dashboardRoutes = require('./src/routes/dashboard.routes');
const categoryRoutes = require('./src/routes/categories.routes');
const publicRoutes = require('./src/routes/public.routes');
const platformRoutes = require('./src/routes/platform.routes');
const errorHandler = require('./src/middleware/errorHandler.middleware');

// Todas las llamadas a Java/Python (axios) se cortan si el servicio no responde
axios.defaults.timeout = Number(process.env.UPSTREAM_TIMEOUT_MS) || 15000;

/**
 * Logger JSON. Nunca registra cookies ni cabeceras de autorización.
 * En pruebas queda en silencio (LOG_LEVEL=silent) salvo que se pase un stream.
 */
function createLogger(stream) {
    return pino({
        level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
        base: { service: 'gateway' },
        timestamp: pino.stdTimeFunctions.isoTime,
        redact: {
            paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
            censor: '[REDACTED]'
        }
    }, stream);
}

function createApp({ logger = createLogger() } = {}) {
    const app = express();
    const isProd = process.env.NODE_ENV === 'production';
    const isDev = !isProd;

    // Detrás de un proxy inverso (Nginx, balanceador) hay que declararlo para que
    // req.ip y el rate limiting usen la IP real del cliente. Ej: TRUST_PROXY=1
    const trustProxy = process.env.TRUST_PROXY;
    if (trustProxy) {
        app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true' ? true : trustProxy);
    }
    app.disable('x-powered-by');

    const FRONTEND_ORIGIN = process.env.FRONTEND_URL
        || (isProd ? 'https://tu-dominio.com' : 'http://localhost:5173');

    // ── Registro estructurado ────────────────────────────────────────────────
    app.use(pinoHttp({
        logger,
        // ID de correlación: se reutiliza el que mande el proxy si es razonable
        genReqId: (req, res) => {
            const incoming = req.headers['x-request-id'];
            const id = typeof incoming === 'string' && /^[\w.-]{8,64}$/.test(incoming)
                ? incoming : crypto.randomUUID();
            res.setHeader('X-Request-Id', id);
            return id;
        },
        autoLogging: { ignore: (req) => req.url === '/health' },
        customLogLevel: (req, res, err) =>
            err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        // Ruta sin query string: la búsqueda del usuario no debe quedar en los logs
        serializers: {
            req: (req) => ({ id: req.id, method: req.method, path: (req.url || '').split('?')[0] }),
            res: (res) => ({ statusCode: res.statusCode }),
            // pino-http crea un error sintético en cada 5xx; sin stack para no ensuciar el log
            // (el error real lo registra errorHandler con su stack completo)
            err: (e) => ({ type: e.type, message: e.message })
        },
        // req.user lo pone authenticate() dentro de las rutas, así que el usuario solo
        // existe al terminar la respuesta: por eso se agrega aquí y no en customProps
        customSuccessObject: (req, res, val) => ({ ...val, userId: req.user?.id ?? null }),
        customErrorObject: (req, res, err, val) => ({ ...val, userId: req.user?.id ?? null })
    }));

    // ── Seguridad ────────────────────────────────────────────────────────────
    app.use(helmet());

    // Con cookies httpOnly el origin no puede ser '*': debe ser exacto y credentials:true.
    // La landing (otro dominio) solo puede llamar a /api/public, y SIN cookies.
    const landingOrigins = (process.env.LANDING_URL || '').split(',').map(o => o.trim()).filter(Boolean);
    app.use(cors((req, callback) => {
        if (req.path.startsWith('/api/public')) {
            return callback(null, {
                origin: [FRONTEND_ORIGIN, ...landingOrigins],
                credentials: false,
                methods: ['POST', 'OPTIONS'],
                allowedHeaders: ['Content-Type']
            });
        }
        callback(null, {
            origin: FRONTEND_ORIGIN,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization']
        });
    }));

    // Límite de tamaño del cuerpo (una venta de 200 líneas pesa unos pocos KB)
    const bodyLimit = process.env.BODY_LIMIT || '100kb';
    app.use(express.json({ limit: bodyLimit }));
    app.use(express.urlencoded({ extended: true, limit: bodyLimit }));
    app.use(cookieParser());

    // ── Rate limiting ────────────────────────────────────────────────────────
    // Estricto SOLO para login (fuerza bruta), por IP
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Demasiados intentos de inicio de sesión. Intenta más tarde.' }
    });

    // General para el resto de la API, por IP. authenticate() corre dentro de cada
    // router, así que aquí aún no hay usuario. En desarrollo se relaja mucho.
    const apiLimiter = rateLimit({
        windowMs: 5 * 60 * 1000,
        max: isDev ? 5000 : 600,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Demasiadas peticiones. Espera un momento.' }
    });

    // ── Health check (sin datos internos) ────────────────────────────────────
    app.get('/health', (req, res) => {
        res.json({
            status: 'OK',
            service: 'StockMind API Gateway',
            timestamp: new Date().toISOString()
        });
    });

    // ── Rutas de la API ──────────────────────────────────────────────────────
    app.use('/api/auth/login', authLimiter);
    app.use('/api', apiLimiter);

    app.use('/api/auth', authRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/products', productRoutes);
    app.use('/api/inventory', inventoryRoutes);
    app.use('/api/sales', salesRoutes);
    app.use('/api/reports', reportRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    app.use('/api/categories', categoryRoutes);
    app.use('/api/public', publicRoutes);       // sin sesión: registro y verificación de correo
    app.use('/api/platform', platformRoutes);   // solo PLATFORM_ADMIN
    app.use('/api/predictions', predictionRoutes);
    app.use('/api/agent', agentRoutes); // asistente IA (en reconstrucción)

    app.use((req, res) => {
        res.status(404).json({ error: 'Ruta no encontrada' });
    });

    app.use(errorHandler);

    return app;
}

module.exports = { createApp, createLogger };
