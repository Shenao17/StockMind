/**
 * StockMind Gateway — Rutas de Productos
 * ========================================
 * Proxy hacia Java Spring Boot para todas las operaciones sobre productos.
 * Requiere autenticación en todas las rutas.
 * Las operaciones de escritura (POST/PUT/DELETE) requieren rol ADMIN.
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const config = require('../config/config');

const JAVA = config.javaApiUrl;

// Helper: reenvía headers de autorización
const authHeader = (req) => ({ Authorization: req.headers.authorization });

/**
 * GET /api/products
 * Parámetros opcionales: ?category=&search=&page=&size=
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const response = await axios.get(`${JAVA}/products`, {
            headers: authHeader(req),
            params: req.query
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/products/low-stock
 * Retorna productos cuyo stock_current <= stock_minimum
 */
router.get('/low-stock', authenticate, async (req, res, next) => {
    try {
        const response = await axios.get(`${JAVA}/products/low-stock`, {
            headers: authHeader(req)
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/products/:id
 */
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const response = await axios.get(`${JAVA}/products/${req.params.id}`, {
            headers: authHeader(req)
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/products
 * Requiere rol ADMIN
 * Body: { name, sku, categoryId, description, price, stockCurrent, stockMinimum, unit }
 */
router.post('/', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const response = await axios.post(`${JAVA}/products`, req.body, {
            headers: { ...authHeader(req), 'Content-Type': 'application/json' }
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/products/:id
 * Requiere rol ADMIN
 */
router.put('/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const response = await axios.put(`${JAVA}/products/${req.params.id}`, req.body, {
            headers: { ...authHeader(req), 'Content-Type': 'application/json' }
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/products/:id
 * Requiere rol ADMIN (soft delete — marca active=false)
 */
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const response = await axios.delete(`${JAVA}/products/${req.params.id}`, {
            headers: authHeader(req)
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
