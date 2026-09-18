/**
 * StockMind Gateway — Middleware de autenticación JWT
 * =====================================================
 * Verifica el token JWT guardado en la cookie httpOnly "token".
 * Si el token es válido, adjunta el payload decodificado a req.user
 * y permite continuar. Si no, retorna 401.
 *
 * Requiere cookie-parser montado en server.js ANTES de las rutas.
 *
 * Uso: aplicar en rutas protegidas con authenticate()
 * Uso con rol: aplicar requireRole('ADMIN') después de authenticate()
 */

const jwt = require('jsonwebtoken');
const config = require('../config/config');

/**
 * Middleware de autenticación.
 * Extrae el token de la cookie httpOnly: req.cookies.token
 */
const authenticate = (req, res, next) => {
    const token = req.cookies?.token;

    if (!token) {
        return res.status(401).json({
            error: 'No autenticado. Inicia sesión.',
            code: 'NO_TOKEN'
        });
    }

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
