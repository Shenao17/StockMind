/**
 * StockMind Gateway — Rutas de Categorías
 * =========================================
 * GET /api/categories → lista de categorías (cualquier usuario autenticado)
 */
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { authHeader } = require('../utils/authHeader');
const config = require('../config/config');

const JAVA = config.javaApiUrl;

router.get('/', authenticate, async (req, res, next) => {
    try {
        const response = await axios.get(`${JAVA}/categories`, { headers: authHeader(req) });
        res.status(response.status).json(response.data);
    } catch (e) { next(e); }
});

module.exports = router;
