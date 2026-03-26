/**
 * StockMind Gateway — Rutas de Ventas
 * Proxy hacia Java Spring Boot
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const config = require('../config/config');

const JAVA = config.javaApiUrl;
const authHeader = (req) => ({ Authorization: req.headers.authorization });

/** GET /api/sales — Listar ventas (con filtros opcionales por fecha) */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const response = await axios.get(`${JAVA}/sales`, {
            headers: authHeader(req), params: req.query
        });
        res.status(response.status).json(response.data);
    } catch (e) { next(e); }
});

/** GET /api/sales/:id — Detalle de venta con sus items */
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const response = await axios.get(`${JAVA}/sales/${req.params.id}`, {
            headers: authHeader(req)
        });
        res.status(response.status).json(response.data);
    } catch (e) { next(e); }
});

/**
 * POST /api/sales — Registrar nueva venta
 * Body: { items: [{ productId, quantity, unitPrice }], notes }
 */
router.post('/', authenticate, async (req, res, next) => {
    try {
        const response = await axios.post(`${JAVA}/sales`, req.body, {
            headers: { ...authHeader(req), 'Content-Type': 'application/json' }
        });
        res.status(response.status).json(response.data);
    } catch (e) { next(e); }
});

module.exports = router;
