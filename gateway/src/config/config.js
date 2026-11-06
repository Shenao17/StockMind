/**
 * StockMind Gateway — Configuración centralizada
 * Exporta todas las variables de entorno.
 * JWT_SECRET e INTERNAL_API_KEY son obligatorios: sin ellos el gateway no arranca (no hay valor por defecto).
 */
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET no está definido o tiene menos de 32 caracteres. Revisa tu archivo .env');
}

// Clave compartida gateway ↔ analytics: demuestra a Python que la petición viene del gateway
if (!process.env.INTERNAL_API_KEY || process.env.INTERNAL_API_KEY.length < 32) {
    throw new Error('INTERNAL_API_KEY no está definido o tiene menos de 32 caracteres. Revisa tu archivo .env');
}

module.exports = {
    port: parseInt(process.env.PORT) || 3000,
    javaApiUrl: process.env.JAVA_API_URL || 'http://localhost:8080',
    pythonApiUrl: process.env.PYTHON_API_URL || 'http://localhost:8000',
    jwtSecret: process.env.JWT_SECRET,
    internalApiKey: process.env.INTERNAL_API_KEY,
    // Registro público: protección anti-bots y límite de altas por IP y hora
    captchaProvider: (process.env.CAPTCHA_PROVIDER || 'none').toLowerCase(),
    turnstileSecret: process.env.TURNSTILE_SECRET || '',
    registrationRateLimit: parseInt(process.env.REGISTRATION_RATE_LIMIT) || 5,
    nodeEnv: process.env.NODE_ENV || 'development',
    groqApiKey: process.env.GROQ_API_KEY || '',
    // El asistente IA está en reconstrucción: apagado salvo AGENT_ENABLED=true
    agentEnabled: process.env.AGENT_ENABLED === 'true'
};
