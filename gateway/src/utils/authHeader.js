/**
 * StockMind Gateway — Helper de autorización
 * ============================================
 * Construye el header Authorization que se reenvía a los backends
 * (Java, Python) a partir del JWT guardado en la cookie httpOnly.
 *
 * Antes leía req.headers.authorization (cuando el token viajaba como
 * header desde el frontend). Ahora el token vive SOLO en la cookie
 * "token" (ver auth.middleware.js / auth.routes.js), así que se
 * reconstruye el header Bearer aquí, en el único lugar que lo hace,
 * para no repetir esta lógica en cada archivo de rutas.
 */

const authHeader = (req) => ({ Authorization: `Bearer ${req.cookies?.token}` });

module.exports = { authHeader };