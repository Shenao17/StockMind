/**
 * StockMind Gateway — Rutas del Dashboard
 * =========================================
 * GET /api/dashboard/summary → indicadores del panel principal (cualquier usuario autenticado)
 */
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { authHeader } = require('../utils/authHeader');
const config = require('../config/config');

const JAVA = config.javaApiUrl;

router.get('/summary', authenticate, async (req, res, next) => {
    try {
        const response = await axios.get(`${JAVA}/dashboard/summary`, { headers: authHeader(req) });
        res.status(response.status).json(response.data);
    } catch (e) { next(e); }
});

module.exports = router;
