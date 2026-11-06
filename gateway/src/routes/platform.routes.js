/**
 * StockMind Gateway — Rutas del equipo de plataforma (roles PLATFORM_*; permisos en el backend)
 * ============================================================================
 * GET  /api/platform/organizations               → lista paginada (con suscripción)
 * POST /api/platform/organizations               → alta de empresa (prueba, pago recibido o cortesía)
 * GET  /api/platform/organizations/:id
 * POST /api/platform/organizations/:id/suspend | reactivate | cancel
 * POST /api/platform/organizations/:id/extend-trial   { days }
 * POST /api/platform/organizations/:id/plan           { planCode, billingCycle, complimentary }
 * POST /api/platform/organizations/:id/payment-links  { planCode, billingCycle }
 * POST /api/platform/organizations/:id/manual-payment { planCode, billingCycle }
 * GET  /api/platform/organizations/:id/detail         → ficha: datos, plan y uso, usuarios, cobros, línea de tiempo
 * PATCH /api/platform/organizations/:id/contact        { name, legalName, phone, contactEmail, country }
 * PATCH /api/platform/organizations/:id/tax-id         { taxId, pin }   (solo el dueño)
 * GET  /api/platform/summary                           → métricas (ingresos solo con permiso de cobros)
 * GET  /api/platform/payments                          → cobros de todas las empresas (filtros y paginación)
 * GET  /api/platform/audit                             → auditoría (filtros y paginación)
 * GET  /api/platform/team                              → miembros (solo el dueño)
 * POST /api/platform/team                              { fullName, email, role, pin }
 * PATCH /api/platform/team/:id                         { role, active, fullName, pin }
 * POST /api/platform/team/:id/reset-access             { pin }
 */
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticate, requirePlatform } = require('../middleware/auth.middleware');
const { authHeader } = require('../utils/authHeader');
const config = require('../config/config');
const { clearEntitlementCache } = require('../middleware/feature.middleware');

const JAVA = config.javaApiUrl;
// Cualquier rol de plataforma pasa el gateway; el backend aplica el permiso de cada acción (403 si no)
const guard = [authenticate, requirePlatform];

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

// Solo pasan los filtros conocidos; el resto de la query se descarta
const QUERY = {
    payments: ['status', 'organizationId', 'search', 'from', 'to', 'page', 'size', 'sort', 'dir'],
    audit: ['action', 'actor', 'organizationId', 'from', 'to', 'page', 'size', 'sort', 'dir']
};

router.get('/summary', ...guard, async (req, res, next) => {
    try {
        const r = await axios.get(`${JAVA}/platform/summary`, { headers: authHeader(req) });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

for (const name of ['payments', 'audit']) {
    router.get(`/${name}`, ...guard, async (req, res, next) => {
        try {
            const r = await axios.get(`${JAVA}/platform/${name}`, { headers: authHeader(req), params: pick(req.query, QUERY[name]) });
            res.status(r.status).json(r.data);
        } catch (e) { next(e); }
    });
}

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

const validId = (req, res) => {
    if (!/^\d{1,18}$/.test(req.params.id)) { res.status(400).json({ error: 'Identificador inválido' }); return false; }
    return true;
};

router.get('/organizations/:id/detail', ...guard, async (req, res, next) => {
    try {
        if (!validId(req, res)) return;
        const r = await axios.get(`${JAVA}/platform/organizations/${req.params.id}/detail`, { headers: authHeader(req) });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.patch('/organizations/:id/contact', ...guard, async (req, res, next) => {
    try {
        if (!validId(req, res)) return;
        const r = await axios.patch(`${JAVA}/platform/organizations/${req.params.id}/contact`,
            pick(req.body, ['name', 'legalName', 'phone', 'contactEmail', 'country']), {
                headers: { ...authHeader(req), 'Content-Type': 'application/json' }
            });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.patch('/organizations/:id/tax-id', ...guard, async (req, res, next) => {
    try {
        if (!validId(req, res)) return;
        const r = await axios.patch(`${JAVA}/platform/organizations/${req.params.id}/tax-id`,
            pick(req.body, ['taxId', 'pin']), {
                headers: { ...authHeader(req), 'Content-Type': 'application/json' }
            });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

// Reinicia el 2FA de un usuario de una empresa (solo el dueño, con su PIN) — antes de '/:id/:action'
router.post('/organizations/:id/users/:userId/reset-mfa', ...guard, async (req, res, next) => {
    try {
        const { id, userId } = req.params;
        if (!/^\d{1,18}$/.test(id) || !/^\d{1,18}$/.test(userId)) return res.status(400).json({ error: 'Identificador inválido' });
        const r = await axios.post(`${JAVA}/platform/organizations/${id}/users/${userId}/reset-mfa`, pick(req.body, ['pin']), {
            headers: { ...authHeader(req), 'Content-Type': 'application/json' }
        });
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

// ───────────────────────── Equipo de plataforma ─────────────────────────

router.get('/team', ...guard, async (req, res, next) => {
    try {
        const r = await axios.get(`${JAVA}/platform/team`, { headers: authHeader(req) });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.post('/team', ...guard, async (req, res, next) => {
    try {
        const r = await axios.post(`${JAVA}/platform/team`, pick(req.body, ['fullName', 'email', 'role', 'pin']), {
            headers: { ...authHeader(req), 'Content-Type': 'application/json' }
        });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.patch('/team/:id', ...guard, async (req, res, next) => {
    try {
        if (!/^\d{1,18}$/.test(req.params.id)) return res.status(400).json({ error: 'Identificador inválido' });
        const r = await axios.patch(`${JAVA}/platform/team/${req.params.id}`,
            pick(req.body, ['role', 'active', 'fullName', 'pin']), {
                headers: { ...authHeader(req), 'Content-Type': 'application/json' }
            });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.post('/team/:id/reset-access', ...guard, async (req, res, next) => {
    try {
        if (!/^\d{1,18}$/.test(req.params.id)) return res.status(400).json({ error: 'Identificador inválido' });
        const r = await axios.post(`${JAVA}/platform/team/${req.params.id}/reset-access`, pick(req.body, ['pin']), {
            headers: { ...authHeader(req), 'Content-Type': 'application/json' }
        });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

module.exports = router;
