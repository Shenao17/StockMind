/**
 * StockMind Gateway — Rutas de Autenticación
 * ============================================
 * Proxy hacia el backend Java para login y perfil de usuario.
 * El login NO requiere token. Las demás rutas sí.
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const config = require('../config/config');

const JAVA = config.javaApiUrl;

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Respuesta: { token, user: { id, username, role } }
 */
router.post('/login', async (req, res, next) => {
    try {
        const response = await axios.post(`${JAVA}/auth/login`, req.body);
        res.status(response.status).json(response.data);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>
 * Respuesta: { id, username, email, role }
 */
router.get('/me', authenticate, async (req, res, next) => {
    try {
        const response = await axios.get(`${JAVA}/auth/me`, {
            headers: { Authorization: req.headers.authorization }
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
