/**
 * StockMind Gateway — Rutas del dueño de la plataforma (solo PLATFORM_ADMIN)
 * ============================================================================
 * GET  /api/platform/organizations               → lista paginada (con suscripción)
 * POST /api/platform/organizations               → alta de empresa (prueba, pago recibido o cortesía)
 * GET  /api/platform/organizations/:id
 * POST /api/platform/organizations/:id/suspend | reactivate | cancel
 * POST /api/platform/organizations/:id/extend-trial   { days }
 * POST /api/platform/organizations/:id/plan           { planCode, billingCycle, complimentary }
 * POST /api/platform/organizations/:id/payment-links  { planCode, billingCycle }
 * POST /api/platform/organizations/:id/manual-payment { planCode, billingCycle }
 */
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { authHeader } = require('../utils/authHeader');
const config = require('../config/config');
const { clearEntitlementCache } = require('../middleware/feature.middleware');

const JAVA = config.javaApiUrl;
const guard = [authenticate, requireRole('PLATFORM_ADMIN')];

const pick = (obj, keys) =>
    Object.fromEntries(keys.filter(k => obj && obj[k] !== undefined).map(k => [k, obj[k]]));

const CREATE_FIELDS = ['companyName', 'legalName', 'taxId', 'phone', 'country', 'adminEmail', 'password',
    'contactEmail', 'planCode', 'mode', 'billingCycle'];

// Campos permitidos por acción (el resto del cuerpo se descarta)
const ACTIONS = {
    suspend: [],
    reactivate: [],
    cancel: [],
    'extend-trial': ['days'],
    plan: ['planCode', 'billingCycle', 'complimentary'],
    'payment-links': ['planCode', 'billingCycle'],
    'manual-payment': ['planCode', 'billingCycle']
};

router.get('/organizations', ...guard, async (req, res, next) => {
    try {
        const r = await axios.get(`${JAVA}/platform/organizations`, { headers: authHeader(req), params: req.query });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.post('/organizations', ...guard, async (req, res, next) => {
    try {
        const r = await axios.post(`${JAVA}/platform/organizations`, pick(req.body, CREATE_FIELDS), {
            headers: { ...authHeader(req), 'Content-Type': 'application/json' }
        });
        clearEntitlementCache();
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.get('/organizations/:id', ...guard, async (req, res, next) => {
    try {
        if (!/^\d{1,18}$/.test(req.params.id)) return res.status(400).json({ error: 'Identificador inválido' });
        const r = await axios.get(`${JAVA}/platform/organizations/${req.params.id}`, { headers: authHeader(req) });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.post('/organizations/:id/:action', ...guard, async (req, res, next) => {
    try {
        const { id, action } = req.params;
        if (!/^\d{1,18}$/.test(id)) return res.status(400).json({ error: 'Identificador inválido' });
        if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) {
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }
        const r = await axios.post(`${JAVA}/platform/organizations/${id}/${action}`, pick(req.body, ACTIONS[action]), {
            headers: { ...authHeader(req), 'Content-Type': 'application/json' }
        });
        clearEntitlementCache();   // suspender, cambiar plan, pagos...: el cambio se ve de inmediato
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

module.exports = router;
