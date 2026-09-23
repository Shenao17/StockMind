/**
 * Middleware de logging hacia MongoDB
 * Ubicación en el proyecto: gateway/src/middleware/mongoLogger.middleware.js
 *
 * Registra cada request/response en la colección "logs" de Mongo.
 * No bloquea la respuesta al cliente: escribe en res.on('finish'),
 * y si Mongo falla o no está disponible, solo lo avisa por consola
 * sin tumbar la petición real.
 */

const { getDb } = require('../../db/mongo');

function mongoLogger(req, res, next) {
    const start = Date.now();

    res.on('finish', () => {
        const statusCode = res.statusCode;
        const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

        try {
            getDb().collection('logs').insertOne({
                timestamp: new Date(),
                service: 'gateway',
                level,
                method: req.method,
                route: req.originalUrl,
                statusCode,
                userId: req.user?.id || null,
                ip: req.ip,
                responseTimeMs: Date.now() - start
            }).catch(err => {
                console.error('⚠️  Error guardando log en Mongo:', err.message);
            });
        } catch (err) {
            // getDb() lanza si Mongo aún no se ha conectado
            console.error('⚠️  Mongo no disponible, log no guardado:', err.message);
        }
    });

    next();
}

module.exports = mongoLogger;