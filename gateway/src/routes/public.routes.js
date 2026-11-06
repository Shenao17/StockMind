/**
 * StockMind Gateway — Rutas públicas (sin sesión)
 * =================================================
 * POST /api/public/registrations        → autoregistro de una empresa
 * POST /api/public/verify-email         → confirma el correo con el token recibido
 * POST /api/public/resend-verification  → reenvía el enlace de verificación
 * GET  /api/public/plans                → planes y precios (para la landing)
 * GET  /api/public/payments/:reference  → resumen de un enlace de pago
 * POST /api/public/payments/:reference/simulate → confirma un pago (solo pasarela simulada)
 *
 * Son el blanco natural de los bots, así que cada una pasa por: límite de frecuencia por IP,
 * campo trampa (honeypot) y CAPTCHA, y solo se reenvían a Java los campos esperados.
 */
const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const config = require('../config/config');
const { verifyCaptcha, CaptchaUnavailableError } = require('../utils/captcha');
const { clearEntitlementCache } = require('../middleware/feature.middleware');

const JAVA = config.javaApiUrl;
const HOUR = 60 * 60 * 1000;

const limiter = (max) => rateLimit({
    windowMs: HOUR,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Inténtalo de nuevo más tarde.', code: 'RATE_LIMITED' }
});

const SIGNUP_FIELDS = ['companyName', 'legalName', 'taxId', 'phone', 'country', 'adminEmail', 'password', 'acceptTerms', 'planCode'];

const pick = (obj, keys) =>
    Object.fromEntries(keys.filter(k => obj && obj[k] !== undefined).map(k => [k, obj[k]]));

const GENERIC_ACCEPTED = {
    message: 'Te enviamos un correo para confirmar tu dirección. Revisa tu bandeja de entrada.'
};

/** Valida el CAPTCHA; responde y devuelve false si no pasa. */
async function passesCaptcha(req, res) {
    try {
        const ok = await verifyCaptcha(req.body?.captchaToken, req.ip);
        if (!ok) {
            res.status(400).json({
                error: 'No pudimos verificar que eres una persona. Inténtalo de nuevo.',
                code: 'CAPTCHA_FAILED'
            });
        }
        return ok;
    } catch (err) {
        if (err instanceof CaptchaUnavailableError) {
            req.log?.error({ error: { message: err.message } }, 'CAPTCHA no disponible');
            res.status(503).json({
                error: 'El registro no está disponible en este momento. Inténtalo más tarde.',
                code: 'REGISTRATION_UNAVAILABLE'
            });
            return false;
        }
        throw err;
    }
}

/** Fábrica: permite crear el router con límites distintos (las pruebas usan uno propio). */
function createPublicRouter({ registrationLimit = config.registrationRateLimit } = {}) {
    const router = express.Router();

    router.post('/registrations', limiter(registrationLimit), async (req, res, next) => {
        try {
            // Honeypot: el formulario real deja "website" vacío y oculto. Un bot lo rellena:
            // se le responde "éxito" sin crear nada ni llamar a Java.
            if (req.body?.website) {
                req.log?.warn('Registro descartado por honeypot');
                return res.status(202).json(GENERIC_ACCEPTED);
            }
            if (!(await passesCaptcha(req, res))) return;

            const r = await axios.post(`${JAVA}/public/registrations`, pick(req.body, SIGNUP_FIELDS));
            res.status(r.status).json(r.data);
        } catch (e) { next(e); }
    });

    router.post('/verify-email', limiter(30), async (req, res, next) => {
        try {
            const r = await axios.post(`${JAVA}/public/verify-email`, pick(req.body, ['token']));
            res.status(r.status).json(r.data);
        } catch (e) { next(e); }
    });

    router.post('/resend-verification', limiter(5), async (req, res, next) => {
        try {
            if (req.body?.website) {
                return res.status(202).json({ message: 'Si el correo corresponde a una cuenta pendiente, enviamos un nuevo enlace.' });
            }
            if (!(await passesCaptcha(req, res))) return;

            const r = await axios.post(`${JAVA}/public/resend-verification`, pick(req.body, ['email']));
            res.status(r.status).json(r.data);
        } catch (e) { next(e); }
    });

    // ── Planes y enlaces de pago (sin sesión) ──────────────────────────────────────
    const REFERENCE = /^[A-Za-z0-9_-]{20,64}$/;
    const badReference = (res) => res.status(404).json({ error: 'Pago no encontrado' });

    router.get('/plans', limiter(120), async (req, res, next) => {
        try {
            const r = await axios.get(`${JAVA}/public/plans`);
            res.status(r.status).json(r.data);
        } catch (e) { next(e); }
    });

    router.get('/payments/:reference', limiter(60), async (req, res, next) => {
        try {
            if (!REFERENCE.test(req.params.reference)) return badReference(res);
            const r = await axios.get(`${JAVA}/public/payments/${req.params.reference}`);
            res.status(r.status).json(r.data);
        } catch (e) { next(e); }
    });

    // Solo funciona con la pasarela SIMULADA (Java responde 404 si no lo está)
    router.post('/payments/:reference/simulate', limiter(20), async (req, res, next) => {
        try {
            if (!REFERENCE.test(req.params.reference)) return badReference(res);
            const r = await axios.post(`${JAVA}/public/payments/${req.params.reference}/simulate`);
            clearEntitlementCache();   // el plan cambió: que se vea de inmediato, no tras la caché
            res.status(r.status).json(r.data);
        } catch (e) { next(e); }
    });

    return router;
}

module.exports = createPublicRouter();
module.exports.createPublicRouter = createPublicRouter;
