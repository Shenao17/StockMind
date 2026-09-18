/**
 * StockMind Gateway — Rutas de Autenticación
 * ============================================
 * Proxy hacia el backend Java para login y perfil de usuario.
 * El login NO requiere token. Las demás rutas sí.
 *
 * El JWT ya NO se devuelve en el body de /login: se setea como cookie
 * httpOnly, así JavaScript en el navegador nunca puede leerlo (mitiga XSS).
 *
 * Java responde login con forma plana: { token, userId, username, role }.
 * El gateway separa el token (va a la cookie) y normaliza el resto en un
 * único objeto "user" para que el frontend siempre reciba { user }.
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const config = require('../config/config');

const JAVA = config.javaApiUrl;
const isProd = process.env.NODE_ENV === 'production';

// Mismas opciones para setear y para limpiar la cookie.
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: isProd,                      // en prod, solo se manda por HTTPS
    sameSite: isProd ? 'strict' : 'lax', // 'lax' en dev: frontend (5173) y gateway (3000) son puertos distintos
    path: '/',
};

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Respuesta: { user: { id, username, role } }
 * Efecto: setea cookie httpOnly "token"
 */
router.post('/login', async (req, res, next) => {
    try {
        const response = await axios.post(`${JAVA}/auth/login`, req.body);
        const { token, userId, username, role } = response.data;

        if (!token) {
            return res.status(502).json({ error: 'El backend no devolvió un token válido' });
        }

        res.cookie('token', token, { ...COOKIE_OPTIONS, maxAge: 24 * 60 * 60 * 1000 });
        res.status(response.status).json({ user: { id: userId, username, role } });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/auth/logout
 * Limpia la cookie httpOnly del lado del servidor.
 */
router.post('/logout', (req, res) => {
    res.clearCookie('token', COOKIE_OPTIONS);
    res.status(200).json({ message: 'Sesión cerrada' });
});

/**
 * GET /api/auth/me
 * Lee el token de la cookie httpOnly (vía authenticate) y consulta el perfil en Java.
 * Respuesta: { id, username, email, role }
 */
router.get('/me', authenticate, async (req, res, next) => {
    try {
        const response = await axios.get(`${JAVA}/auth/me`, {
            headers: { Authorization: `Bearer ${req.cookies.token}` }
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
