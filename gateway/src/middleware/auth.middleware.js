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
        // Todo usuario salvo PLATFORM_ADMIN pertenece a una empresa. Un token sin 'org'
        // (emitido antes de la multiempresa) se invalida para forzar un nuevo login.
        if (decoded.role !== 'PLATFORM_ADMIN' && !decoded.org) {
            return res.status(401).json({
                error: 'Sesión desactualizada. Inicia sesión nuevamente.',
                code: 'INVALID_TOKEN'
            });
        }
        req.user = decoded; // { id, role, org, sub (correo), iat, exp }
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

/**
 * Exige que el usuario pertenezca a una empresa (todo salvo PLATFORM_ADMIN).
 * Se usa en rutas que consultan servicios internos con datos de UNA empresa.
 */
const requireOrganization = (req, res, next) => {
    if (!req.user?.org) {
        return res.status(403).json({
            error: 'Esta operación requiere pertenecer a una empresa',
            code: 'ORGANIZATION_REQUIRED'
        });
    }
    next();
};

module.exports = { authenticate, requireRole, requireOrganization };
