/**
 * StockMind Gateway — Control de funciones por plan
 * ===================================================
 * Las rutas que NO pasan por Java (predicciones → Python, asistente → Groq) deben respetar el plan
 * igual que las de Java. El gateway consulta el estado de la suscripción en el backend (que es la
 * fuente de verdad) y lo guarda unos segundos por empresa para no consultarlo en cada petición.
 *
 * Falla cerrado: si no se puede consultar el plan, la petición NO pasa.
 */
const axios = require('axios');
const config = require('../config/config');
const { authHeader } = require('../utils/authHeader');

const TTL_MS = (parseInt(process.env.ENTITLEMENT_CACHE_SECONDS) || 30) * 1000;
const cache = new Map(); // orgId -> { value, expiresAt }

async function entitlementsOf(req) {
    const org = req.user.org;
    const hit = cache.get(org);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const r = await axios.get(`${config.javaApiUrl}/billing/subscription`, { headers: authHeader(req) });
    const value = { features: r.data.features || [], blocked: !!r.data.blocked, planName: r.data.planName };
    cache.set(org, { value, expiresAt: Date.now() + TTL_MS });
    return value;
}

const requireFeature = (feature) => async (req, res, next) => {
    try {
        const e = await entitlementsOf(req);
        if (e.blocked) {
            return res.status(402).json({
                error: 'Tu cuenta está suspendida. Renueva tu plan para volver a usar StockMind.',
                code: 'SUBSCRIPTION_BLOCKED'
            });
        }
        if (!e.features.includes(feature)) {
            return res.status(402).json({
                error: `Esta función no está incluida en tu plan ${e.planName || ''}. Mejora tu plan para usarla.`.replace('  ', ' '),
                code: 'FEATURE_NOT_IN_PLAN'
            });
        }
        next();
    } catch (err) {
        next(err);
    }
};

/** Vacía la caché: se llama cuando el plan acaba de cambiar (pago confirmado, acción de plataforma). */
const clearEntitlementCache = () => cache.clear();

module.exports = { requireFeature, clearEntitlementCache, __clearCache: clearEntitlementCache };
