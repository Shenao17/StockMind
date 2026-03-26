/**
 * StockMind Gateway — Rutas de Predicciones
 * ===========================================
 * Proxy hacia el microservicio Python Flask.
 * Este es el único módulo del gateway que enruta a Python en lugar de Java.
 */
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const config = require('../config/config');

const PYTHON = config.pythonApiUrl;

/**
 * GET /api/predictions/recommendations
 * Retorna recomendaciones de reabastecimiento para todos los productos
 */
router.get('/recommendations', authenticate, async (req, res, next) => {
    try {
        const response = await axios.get(`${PYTHON}/recommend`);
        res.status(response.status).json(response.data);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/predictions/:productId
 * Retorna predicción de demanda semanal y mensual para un producto específico
 */
router.get('/:productId', authenticate, async (req, res, next) => {
    try {
        const { productId } = req.params;
        const response = await axios.get(`${PYTHON}/predict/${productId}`);
        res.status(response.status).json(response.data);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
