/**
 * StockMind Gateway — Rutas de plan y pagos de la empresa
 * =========================================================
 * GET  /api/billing/subscription → plan, estado, días de prueba, funciones, límites y uso
 * GET  /api/billing/plans        → planes con IVA
 * GET  /api/billing/payments     → historial de cobros (ADMIN)
 * POST /api/billing/checkout     → crea un cobro y devuelve el enlace de pago (ADMIN)
 *
 * Siguen disponibles aunque la suscripción esté vencida: es la vía para pagar.
 */
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticate, requireRole, requireOrganization } = require('../middleware/auth.middleware');
const { authHeader } = require('../utils/authHeader');
const config = require('../config/config');

const JAVA = config.javaApiUrl;

router.get('/subscription', authenticate, requireOrganization, async (req, res, next) => {
    try {
        const r = await axios.get(`${JAVA}/billing/subscription`, { headers: authHeader(req) });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.get('/plans', authenticate, requireOrganization, async (req, res, next) => {
    try {
        const r = await axios.get(`${JAVA}/billing/plans`, { headers: authHeader(req) });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.get('/payments', authenticate, requireOrganization, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const r = await axios.get(`${JAVA}/billing/payments`, { headers: authHeader(req) });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.post('/checkout', authenticate, requireOrganization, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const body = { planCode: req.body?.planCode, billingCycle: req.body?.billingCycle };
        const r = await axios.post(`${JAVA}/billing/checkout`, body, {
            headers: { ...authHeader(req), 'Content-Type': 'application/json' }
        });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

module.exports = router;
