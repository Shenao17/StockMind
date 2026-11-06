/**
 * StockMind Gateway — Rutas de Autenticación
 * ============================================
 * Proxy hacia el backend Java para login y perfil de usuario.
 * El login NO requiere token. Las demás rutas sí.
 *
 * El JWT ya NO se devuelve en el body de /login: se setea como cookie
 * httpOnly, así JavaScript en el navegador nunca puede leerlo (mitiga XSS).
 *
 * Java responde login con forma plana: { token, userId, username, role }.
 * El gateway separa el token (va a la cookie) y normaliza el resto en un
 * único objeto "user" para que el frontend siempre reciba { user }.
 */

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const config = require('../config/config');

const JAVA = config.javaApiUrl;
const isProd = process.env.NODE_ENV === 'production';

// Mismas opciones para setear y para limpiar la cookie.
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: isProd,                      // en prod, solo se manda por HTTPS
    sameSite: isProd ? 'strict' : 'lax', // 'lax' en dev: frontend (5173) y gateway (3000) son puertos distintos
    path: '/',
};

const pick = (obj, keys) =>
    Object.fromEntries(keys.filter(k => obj && obj[k] !== undefined).map(k => [k, obj[k]]));

/**
 * Convierte la respuesta de Java en la del gateway.
 *  - Sesión completa (trae token): se guarda en la cookie httpOnly y se devuelve { user }.
 *  - Equipo de plataforma sin segundo paso: NO hay token; se devuelve { challenge } para continuar
 *    en /mfa/verify o /mfa/enroll/*. El token de desafío viaja en el cuerpo (nunca en cookie).
 */
function respondWithSession(res, response) {
    const d = response.data;
    if (!d.token) {
        if (d.challengeToken && (d.mfaRequired || d.enrollmentRequired)) {
            return res.status(200).json({
                challenge: {
                    token: d.challengeToken,
                    mfaRequired: !!d.mfaRequired,
                    enrollmentRequired: !!d.enrollmentRequired,
                    mustChangePassword: !!d.mustChangePassword,
                    fullName: d.fullName || null
                }
            });
        }
        return res.status(502).json({ error: 'No fue posible completar el inicio de sesión.' });
    }

    // La cookie dura lo que el token (el equipo de plataforma tiene sesiones más cortas)
    const exp = jwt.decode(d.token)?.exp;
    const maxAge = exp ? Math.max(1000, exp * 1000 - Date.now()) : 24 * 60 * 60 * 1000;
    res.cookie('token', d.token, { ...COOKIE_OPTIONS, maxAge });

    const body = {
        user: {
            id: d.userId, username: d.username, email: d.email,
            organizationId: d.organizationId, role: d.role, fullName: d.fullName || null
        }
    };
    if (Array.isArray(d.backupCodes)) body.backupCodes = d.backupCodes;   // se muestran una sola vez
    return res.status(200).json(body);
}

/** Errores de los pasos de verificación: mensajes de Java (códigos/PIN/contraseña), sin detalles internos. */
function mfaError(error, res, next) {
    if (error.response && [400, 401, 403].includes(error.response.status)) {
        return res.status(error.response.status).json({
            error: error.response.data?.error || 'No se pudo completar la verificación.'
        });
    }
    if (error.response && error.response.status >= 500) {
        return res.status(503).json({ error: 'El servidor no se encuentra disponible en este momento.' });
    }
    return next(error);
}

router.post('/mfa/verify', async (req, res, next) => {
    try {
        const r = await axios.post(`${JAVA}/auth/mfa/verify`, pick(req.body, ['challengeToken', 'code']));
        return respondWithSession(res, r);
    } catch (e) { return mfaError(e, res, next); }
});

router.post('/mfa/enroll/start', async (req, res, next) => {
    try {
        const r = await axios.post(`${JAVA}/auth/mfa/enroll/start`, pick(req.body, ['challengeToken']));
        return res.status(200).json(r.data);
    } catch (e) { return mfaError(e, res, next); }
});

router.post('/mfa/enroll/finish', async (req, res, next) => {
    try {
        const r = await axios.post(`${JAVA}/auth/mfa/enroll/finish`,
            pick(req.body, ['challengeToken', 'code', 'pin', 'newPassword']));
        return respondWithSession(res, r);
    } catch (e) { return mfaError(e, res, next); }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Respuesta: { user: { id, username, email, organizationId, role } }
 * Efecto: setea cookie httpOnly "token"
 */
router.post('/login', async (req, res, next) => {
    try {
        const response = await axios.post(`${JAVA}/auth/login`, pick(req.body, ['email', 'password']));
        return respondWithSession(res, response);

    } catch (error) {

        /*
         * Java respondió con un código HTTP.
         * Esto significa que la conexión con el backend sí funcionó,
         * por lo que podemos distinguir autenticación de disponibilidad.
         */
        if (error.response) {
            const status = error.response.status;

            // Credenciales incorrectas (mensaje genérico) o aviso de cuenta (correo sin verificar,
            // usuario inactivo, empresa suspendida). Java solo envía estos avisos DESPUÉS de validar
            // la contraseña, así que mostrarlos no revela qué correos existen.
            if (status === 401 || status === 403) {
                const javaMessage = error.response.data?.error;
                const isGeneric = !javaMessage || javaMessage === 'Credenciales inválidas';
                return res.status(status).json({
                    error: isGeneric ? 'Correo o contraseña incorrectos.' : javaMessage
                });
            }

            // Error interno del backend Java.
            if (status >= 500) {
                return res.status(503).json({
                    error: 'El servidor no se encuentra disponible en este momento. Puede estar temporalmente fuera de servicio o en mantenimiento.'
                });
            }

            // Otros errores controlados.
            return res.status(status).json({
                error:
                    error.response.data?.error ||
                    'No fue posible completar el inicio de sesión.'
            });
        }

        /*
         * No hubo respuesta de Java.
         * Puede ser que el servicio esté apagado, haya rechazado
         * la conexión, haya ocurrido un timeout o no se pueda resolver
         * la dirección configurada.
         */
        if (
            error.code === 'ECONNREFUSED' ||
            error.code === 'ECONNABORTED' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ENOTFOUND' ||
            error.code === 'ERR_NETWORK'
        ) {
            return res.status(503).json({
                error: 'El servidor no se encuentra disponible en este momento. Puede estar temporalmente fuera de servicio o en mantenimiento.'
            });
        }

        /*
         * Error inesperado.
         * No exponemos detalles internos del gateway ni de Java
         * al navegador.
         */
        return res.status(503).json({
            error: 'No fue posible conectar con el servidor. Intenta nuevamente en unos minutos.'
        });
    }
});

/**
 * POST /api/auth/logout
 * Limpia la cookie httpOnly del lado del servidor.
 */
router.post('/logout', (req, res) => {
    res.clearCookie('token', COOKIE_OPTIONS);
    res.status(200).json({ message: 'Sesión cerrada' });
});

/**
 * GET /api/auth/me
 * Lee el token de la cookie httpOnly (vía authenticate) y consulta el perfil en Java.
 * Respuesta: { id, username, email, role }
 */
router.get('/me', authenticate, async (req, res, next) => {
    try {
        const response = await axios.get(`${JAVA}/auth/me`, {
            headers: {
                Authorization: `Bearer ${req.cookies.token}`
            }
        });

        res.status(response.status).json(response.data);

    } catch (error) {
        next(error);
    }
});

module.exports = router;