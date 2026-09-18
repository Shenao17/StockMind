/**
 * StockMind — API Gateway
 * ========================
 * Servidor principal del gateway Node.js + Express.
 *
 * Responsabilidades:
 * - Punto de entrada único para el frontend
 * - Verificación centralizada de tokens JWT (vía cookie httpOnly)
 * - Enrutamiento hacia Java Spring Boot (lógica de negocio)
 * - Enrutamiento hacia Python Flask (analítica predictiva)
 * - CORS, rate limiting y logging
 *
 * Puerto: 3000 (configurable en .env)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// Importar rutas
const authRoutes = require('./src/routes/auth.routes');
const productRoutes = require('./src/routes/products.routes');
const inventoryRoutes = require('./src/routes/inventory.routes');
const salesRoutes = require('./src/routes/sales.routes');
const userRoutes = require('./src/routes/users.routes');
const reportRoutes = require('./src/routes/reports.routes');
const predictionRoutes = require('./src/routes/predictions.routes');
const agentRoutes      = require('./src/routes/agent.routes');

// Importar middlewares
const errorHandler = require('./src/middleware/errorHandler.middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

// Origen del frontend permitido a mandar/recibir cookies.
// Usa FRONTEND_URL si la defines en docker-compose (útil al probar desde
// otro PC/IP en la red); si no, cae a localhost:5173.
const FRONTEND_ORIGIN = process.env.FRONTEND_URL
    || (process.env.NODE_ENV === 'production' ? 'https://tu-dominio.com' : 'http://localhost:5173');

// =============================================================================
// Middlewares globales
// =============================================================================

// CORS: con cookies httpOnly, el origin ya NO puede ser '*' — debe ser
// exacto, y credentials:true es obligatorio para que el navegador mande
// y acepte la cookie entre el frontend (5173) y el gateway (3000).
app.use(cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parser de JSON en el body de las peticiones
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Parser de cookies — necesario para que auth.middleware.js lea req.cookies.token
app.use(cookieParser());

// Logging de peticiones HTTP en desarrollo
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
}

// =============================================================================
// Rate limiting
// =============================================================================
// Límite estricto SOLO para login (protege contra fuerza bruta).
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    message: { error: 'Demasiados intentos de inicio de sesión. Intenta más tarde.' }
});

// Límite general para el resto de la API.
// En desarrollo se relaja mucho (max: 5000) para poder entrar/salir de
// módulos sin agotarlo mientras se prueba. En producción queda en un valor
// generoso pero real (600 cada 5 min).
const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutos
    max: isDev ? 5000 : 600,
    standardHeaders: true,
    legacyHeaders: false,
    // Nota: como authenticate() se aplica DENTRO de cada archivo de rutas
    // (no antes de este middleware), req.user todavía no existe aquí —
    // por ahora esto limita por IP igual que antes. Pendiente reordenar
    // si se quiere limitar por usuario autenticado.
    keyGenerator: (req) => req.user?.id || req.ip,
    message: { error: 'Demasiadas peticiones. Espera un momento.' }
});

// =============================================================================
// Health check del gateway
// =============================================================================
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'StockMind API Gateway',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        upstreams: {
            java: process.env.JAVA_API_URL,
            python: process.env.PYTHON_API_URL
        }
    });
});

// =============================================================================
// Registro de rutas del API
// Todas las rutas pasan por el prefijo /api/
// =============================================================================

app.use('/api/auth/login', authLimiter);
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/agent',       agentRoutes);                           // Rutas del asistente IA (experimental)

// Ruta no encontrada (404)
app.use((req, res) => {
    res.status(404).json({
        error: 'Ruta no encontrada',
        path: req.originalUrl
    });
});

// Manejador global de errores
app.use(errorHandler);

// =============================================================================
// Inicialización del servidor
// =============================================================================
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log(`  StockMind API Gateway — Puerto ${PORT}`);
    console.log(`  Java Backend: ${process.env.JAVA_API_URL}`);
    console.log(`  Python Analytics: ${process.env.PYTHON_API_URL}`);
    console.log(`  Frontend permitido (CORS): ${FRONTEND_ORIGIN}`);
    console.log(`  Entorno: ${process.env.NODE_ENV}`);
    console.log('='.repeat(60));
});

module.exports = app;
