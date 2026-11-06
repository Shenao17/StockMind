/**
 * StockMind — API Gateway (arranque)
 * ====================================
 * Pone a escuchar la aplicación definida en app.js.
 * Puerto: 3000 (configurable con PORT)
 */
const { createApp, createLogger } = require('./app');

const PORT = process.env.PORT || 3000;
const logger = createLogger();
const app = createApp({ logger });

app.listen(PORT, () => {
    logger.info({
        port: PORT,
        env: process.env.NODE_ENV || 'development',
        javaApi: process.env.JAVA_API_URL,
        pythonApi: process.env.PYTHON_API_URL,
        corsOrigin: process.env.FRONTEND_URL || 'http://localhost:5173'
    }, 'StockMind API Gateway iniciado');
});

module.exports = app;
