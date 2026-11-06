/**
 * StockMind Gateway — Rutas de Usuarios (solo ADMIN)
 */
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { authHeader } = require('../utils/authHeader');
const config = require('../config/config');

const JAVA = config.javaApiUrl;

router.get('/', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const r = await axios.get(`${JAVA}/users`, { headers: authHeader(req), params: req.query });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.post('/', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const r = await axios.post(`${JAVA}/users`, req.body, {
            headers: { ...authHeader(req), 'Content-Type': 'application/json' }
        });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

// ── Verificación en dos pasos de la empresa (antes de '/:id' para que 'mfa-policy' no se tome por un id) ──

router.get('/mfa-policy', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const r = await axios.get(`${JAVA}/users/mfa-policy`, { headers: authHeader(req) });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.put('/mfa-policy', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const r = await axios.put(`${JAVA}/users/mfa-policy`, { required: req.body?.required }, {
            headers: { ...authHeader(req), 'Content-Type': 'application/json' }
        });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.post('/:id/reset-mfa', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        if (!/^\d{1,18}$/.test(req.params.id)) return res.status(400).json({ error: 'Identificador inválido' });
        const r = await axios.post(`${JAVA}/users/${req.params.id}/reset-mfa`, {}, {
            headers: { ...authHeader(req), 'Content-Type': 'application/json' }
        });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.put('/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const r = await axios.put(`${JAVA}/users/${req.params.id}`, req.body, {
            headers: { ...authHeader(req), 'Content-Type': 'application/json' }
        });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const r = await axios.delete(`${JAVA}/users/${req.params.id}`, { headers: authHeader(req) });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

module.exports = router;
