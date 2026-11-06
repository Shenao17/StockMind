/**
 * StockMind Gateway — Cabeceras para servicios internos (analytics)
 * ==================================================================
 * Analytics no verifica el JWT: confía en el gateway. Por eso el gateway le dice
 * QUÉ empresa es (tomada del token ya verificado, nunca de la petición del cliente)
 * y se identifica con una clave compartida que Python comprueba.
 */
const config = require('../config/config');

const internalHeaders = (req) => ({
    'X-Internal-Key': config.internalApiKey,
    'X-Organization-Id': String(req.user.org)
});

module.exports = { internalHeaders };
