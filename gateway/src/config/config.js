/**
 * StockMind Gateway — Configuración centralizada
 * Exporta todas las variables de entorno.
 * JWT_SECRET es obligatorio: sin él el gateway no arranca (no hay valor por defecto).
 */
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET no está definido o tiene menos de 32 caracteres. Revisa tu archivo .env');
}

module.exports = {
    port: parseInt(process.env.PORT) || 3000,
    javaApiUrl: process.env.JAVA_API_URL || 'http://localhost:8080',
    pythonApiUrl: process.env.PYTHON_API_URL || 'http://localhost:8000',
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV || 'development',
    groqApiKey: process.env.GROQ_API_KEY || ''
};
