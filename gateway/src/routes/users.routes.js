/**
 * StockMind Gateway — Rutas de Usuarios (solo ADMIN)
 */
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const config = require('../config/config');

const JAVA = config.javaApiUrl;
const authHeader = (req) => ({ Authorization: req.headers.authorization });

router.get('/', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const r = await axios.get(`${JAVA}/users`, { headers: authHeader(req) });
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
