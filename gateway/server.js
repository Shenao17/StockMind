/**
 * StockMind — API Gateway
 * ========================
 * Servidor principal del gateway Node.js + Express.
 *
 * Responsabilidades:
 * - Punto de entrada único para el frontend
 * - Verificación centralizada de tokens JWT
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
const rateLimit = require('express-rate-limit');

// Importar rutas
const authRoutes = require('./src/routes/auth.routes');
const productRoutes = require('./src/routes/products.routes');
const inventoryRoutes = require('./src/routes/inventory.routes');
const salesRoutes = require('./src/routes/sales.routes');
const userRoutes = require('./src/routes/users.routes');
const reportRoutes = require('./src/routes/reports.routes');
const predictionRoutes = require('./src/routes/predictions.routes');

// Importar middlewares
const errorHandler = require('./src/middleware/errorHandler.middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================================================
// Middlewares globales
// =============================================================================

// CORS: permite peticiones desde el frontend (ajustar origin en producción)
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? 'https://tu-dominio.com'
        : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parser de JSON en el body de las peticiones
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging de peticiones HTTP en desarrollo
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
}

// Rate limiting: máximo 100 peticiones por IP cada 15 minutos
//POR IMPLENTAR: Ajustar límites según necesidades reales


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
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/predictions', predictionRoutes);

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
    console.log(`  Entorno: ${process.env.NODE_ENV}`);
    console.log('='.repeat(60));
});

module.exports = app;
