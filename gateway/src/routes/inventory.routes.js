/**
 * StockMind Gateway — Rutas de Inventario
 */
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const config = require('../config/config');

const JAVA = config.javaApiUrl;
const authHeader = (req) => ({ Authorization: req.headers.authorization });

router.get('/movements', authenticate, async (req, res, next) => {
    try {
        const response = await axios.get(`${JAVA}/inventory/movements`, {
            headers: authHeader(req), params: req.query
        });
        res.status(response.status).json(response.data);
    } catch (e) { next(e); }
});

router.post('/movements', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const response = await axios.post(`${JAVA}/inventory/movements`, req.body, {
            headers: { ...authHeader(req), 'Content-Type': 'application/json' }
        });
        res.status(response.status).json(response.data);
    } catch (e) { next(e); }
});

module.exports = router;
