/**
 * StockMind Gateway — Manejador global de errores
 * =================================================
 * Intercepta errores no manejados y los transforma en respuestas
 * JSON consistentes con código de estado apropiado.
 */

const errorHandler = (err, req, res, next) => {
    // Error de conexión con servicios upstream (Java o Python)
    if (err.code === 'ECONNREFUSED') {
        const service = err.config?.url?.includes(':8080') ? 'Java Backend' : 'Python Analytics';
        console.error(`[Gateway] Servicio no disponible: ${service} — ${err.config?.url}`);
        return res.status(503).json({
            error: `Servicio ${service} no disponible. Verifique que el servicio esté en ejecución.`,
            code: 'SERVICE_UNAVAILABLE'
        });
    }

    // Timeout de servicio upstream
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        return res.status(504).json({
            error: 'El servicio tardó demasiado en responder',
            code: 'GATEWAY_TIMEOUT'
        });
    }

    // Error con respuesta del upstream (4xx, 5xx de Java o Python)
    if (err.response) {
        const { status, data } = err.response;
        return res.status(status).json(data);
    }

    // Error genérico
    console.error('[Gateway] Error interno:', err.message);
    res.status(500).json({
        error: 'Error interno del gateway',
        code: 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV === 'development' && { detail: err.message })
    });
};

module.exports = errorHandler;
