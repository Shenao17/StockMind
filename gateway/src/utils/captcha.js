/**
 * StockMind Gateway — Verificación anti-bots (CAPTCHA)
 * =====================================================
 * Proveedor configurable con CAPTCHA_PROVIDER:
 *   turnstile → Cloudflare Turnstile (requiere TURNSTILE_SECRET)
 *   none      → sin CAPTCHA: SOLO se tolera fuera de producción. En producción el registro
 *               público se niega (CaptchaUnavailableError): fallar abierto sería regalar el
 *               endpoint a los bots.
 */
const config = require('../config/config');

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

class CaptchaUnavailableError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CaptchaUnavailableError';
    }
}

// Reemplazable en pruebas (nunca se llama a Cloudflare desde los tests)
let fetchImpl = (...args) => fetch(...args);
const __setFetch = (fn) => { fetchImpl = fn; };

/** true = es una persona; false = no superó el desafío. Lanza CaptchaUnavailableError si no está configurado. */
async function verifyCaptcha(token, ip) {
    if (config.captchaProvider === 'turnstile') {
        if (!config.turnstileSecret) {
            throw new CaptchaUnavailableError('CAPTCHA_PROVIDER=turnstile pero falta TURNSTILE_SECRET');
        }
        if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
            return false;
        }
        const body = new URLSearchParams({ secret: config.turnstileSecret, response: token });
        if (ip) body.set('remoteip', ip);

        const res = await fetchImpl(VERIFY_URL, {
            method: 'POST',
            body,
            signal: AbortSignal.timeout(5000)
        });
        const data = await res.json();
        return data?.success === true;
    }

    if (config.nodeEnv === 'production') {
        throw new CaptchaUnavailableError('El CAPTCHA no está configurado en producción');
    }
    return true; // desarrollo sin CAPTCHA
}

module.exports = { verifyCaptcha, CaptchaUnavailableError, __setFetch };
