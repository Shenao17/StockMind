/**
 * StockMind Gateway — Rutas de Reportes (proxy a Java)
 */
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const config = require('../config/config');

const JAVA = config.javaApiUrl;
const authHeader = (req) => ({ Authorization: req.headers.authorization });

/** GET /api/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD */
router.get('/sales', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const r = await axios.get(`${JAVA}/reports/sales`, {
            headers: authHeader(req), params: req.query
        });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

/** GET /api/reports/top-products?limit=10 */
router.get('/top-products', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const r = await axios.get(`${JAVA}/reports/top-products`, {
            headers: authHeader(req), params: req.query
        });
        res.status(r.status).json(r.data);
    } catch (e) { next(e); }
});

module.exports = router;
