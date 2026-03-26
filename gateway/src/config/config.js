/**
 * StockMind Gateway — Configuración centralizada
 * Exporta todas las variables de entorno con valores por defecto seguros.
 */

module.exports = {
    port: parseInt(process.env.PORT) || 3000,
    javaApiUrl: process.env.JAVA_API_URL || 'http://localhost:8080',
    pythonApiUrl: process.env.PYTHON_API_URL || 'http://localhost:8000',
    jwtSecret: process.env.JWT_SECRET || 'stockmind_dev_secret',
    nodeEnv: process.env.NODE_ENV || 'development'
};
