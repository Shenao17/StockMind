/**
 * StockMind Gateway — Rutas del dueño de la plataforma (solo PLATFORM_ADMIN)
 * ============================================================================
 * GET  /api/platform/organizations → lista paginada de empresas
 * POST /api/platform/organizations → alta de una empresa y su primer administrador
 */
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { authHeader } = require('../utils/authHeader');
const config = require('../config/config');

const JAVA = config.javaApiUrl;
const COMPANY_FIELDS = ['companyName', 'legalName', 'taxId', 'phone', 'country', 'adminEmail', 'password', 'contactEmail'];

router.get('/organizations', authenticate, requireRole('PLATFORM_ADMIN'), async (req, res, next) => {
    try {
        const r = await axios.get(`${JAVA}/platform/organizations`, { headers: authHeader(req), params: req.query });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.post('/organizations', authenticate, requireRole('PLATFORM_ADMIN'), async (req, res, next) => {
    try {
        const body = Object.fromEntries(COMPANY_FIELDS.filter(k => req.body?.[k] !== undefined).map(k => [k, req.body[k]]));
        const r = await axios.post(`${JAVA}/platform/organizations`, body, {
            headers: { ...authHeader(req), 'Content-Type': 'application/json' }
        });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

module.exports = router;
