/**
 * StockMind Gateway — Rutas de Predicciones
 * ===========================================
 * Proxy hacia el microservicio Python Flask.
 * Este es el único módulo del gateway que enruta a Python en lugar de Java.
 */
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticate, requireOrganization } = require('../middleware/auth.middleware');
const config = require('../config/config');
const { internalHeaders } = require('../utils/internalHeaders');

const PYTHON = config.pythonApiUrl;

/**
 * GET /api/predictions/recommendations
 * Retorna recomendaciones de reabastecimiento para todos los productos
 */
router.get('/recommendations', authenticate, requireOrganization, async (req, res, next) => {
    try {
        const response = await axios.get(`${PYTHON}/recommend`, { headers: internalHeaders(req) });
        res.status(response.status).json(response.data);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/predictions/:productId
 * Retorna predicción de demanda semanal y mensual para un producto específico
 */
router.get('/:productId', authenticate, requireOrganization, async (req, res, next) => {
    try {
        const { productId } = req.params;
        // Solo dígitos: evita que un valor como "../health" cambie la ruta pedida a Python
        if (!/^\d{1,18}$/.test(productId)) {
            return res.status(400).json({ error: 'Identificador de producto inválido', code: 'INVALID_PRODUCT_ID' });
        }
        const response = await axios.get(`${PYTHON}/predict/${productId}`, { headers: internalHeaders(req) });
        res.status(response.status).json(response.data);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
