/**
 * StockMind Gateway — Manejador global de errores
 * =================================================
 * Intercepta errores no manejados y los transforma en respuestas
 * JSON consistentes con código de estado apropiado.
 * Nunca devuelve mensajes internos al cliente; el detalle va al log.
 */
const errorHandler = (err, req, res, next) => {
    const log = req.log || console;

    // Cuerpo de la petición demasiado grande (límite de express.json)
    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            error: 'La petición es demasiado grande',
            code: 'PAYLOAD_TOO_LARGE'
        });
    }

    // JSON mal formado
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({
            error: 'El cuerpo de la petición no es un JSON válido',
            code: 'INVALID_JSON'
        });
    }

    // Servicio upstream (Java o Python) caído
    if (err.code === 'ECONNREFUSED') {
        const service = err.config?.url?.includes(':8080') ? 'Java Backend' : 'Python Analytics';
        log.error({ upstream: service, url: err.config?.url }, 'Servicio upstream no disponible');
        return res.status(503).json({
            error: `Servicio ${service} no disponible. Verifique que el servicio esté en ejecución.`,
            code: 'SERVICE_UNAVAILABLE'
        });
    }

    // Timeout de un servicio upstream (axios o fetch con AbortSignal.timeout)
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.name === 'TimeoutError') {
        log.error({ code: err.code, name: err.name }, 'Timeout de servicio upstream');
        return res.status(504).json({
            error: 'El servicio tardó demasiado en responder',
            code: 'GATEWAY_TIMEOUT'
        });
    }

    // Error con respuesta del upstream (4xx, 5xx de Java o Python)
    if (err.response) {
        const { status, data } = err.response;
        if (status >= 500) {
            log.error({ status, url: err.config?.url }, 'Error 5xx de servicio upstream');
        }
        return res.status(status).json(data);
    }

    // Error genérico
    log.error({ error: { name: err.name, message: err.message, stack: err.stack } }, 'Error interno del gateway');
    res.status(500).json({
        error: 'Error interno del gateway',
        code: 'INTERNAL_ERROR'
    });
};

module.exports = errorHandler;
