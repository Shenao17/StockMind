/**
 * StockMind Gateway — Middleware de autenticación JWT
 * =====================================================
 * Verifica el token JWT en el header Authorization de cada petición.
 * Si el token es válido, adjunta el payload decodificado a req.user
 * y permite continuar. Si no, retorna 401.
 *
 * Uso: aplicar en rutas protegidas con authenticate()
 * Uso con rol: aplicar requireRole('ADMIN') después de authenticate()
 */

const jwt = require('jsonwebtoken');
const config = require('../config/config');

/**
 * Middleware de autenticación.
 * Extrae el token del header: Authorization: Bearer <token>
 */
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(401).json({
            error: 'Token de autorización requerido',
            code: 'NO_TOKEN'
        });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({
            error: 'Formato de token inválido. Use: Bearer <token>',
            code: 'INVALID_TOKEN_FORMAT'
        });
    }

    const token = parts[1];

    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        req.user = decoded; // { id, username, role, iat, exp }
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expirado. Por favor inicia sesión nuevamente.',
                code: 'TOKEN_EXPIRED'
            });
        }
        return res.status(401).json({
            error: 'Token inválido',
            code: 'INVALID_TOKEN'
        });
    }
};

/**
 * Middleware de autorización por rol.
 * Debe usarse DESPUÉS de authenticate().
 * @param {...string} roles - Roles permitidos ('ADMIN', 'SELLER')
 */
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado', code: 'NOT_AUTHENTICATED' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}`,
                code: 'INSUFFICIENT_ROLE'
            });
        }

        next();
    };
};

module.exports = { authenticate, requireRole };
