/**
 * Utilidades compartidas de las pruebas del gateway.
 * Usa el runner nativo de Node (node:test): no requiere dependencias nuevas.
 */
process.env.JWT_SECRET = 'secreto-solo-para-pruebas-automaticas-0123456789abcdef';
process.env.INTERNAL_API_KEY = 'clave-interna-solo-para-pruebas-0123456789abcdef';
// Upstreams inexistentes: las pruebas nunca deben hablar con servicios reales
// (puerto 9 = discard, conexión rechazada → el gateway responde 503)
process.env.JAVA_API_URL = 'http://127.0.0.1:9';
process.env.PYTHON_API_URL = 'http://127.0.0.1:9';

const jwt = require('jsonwebtoken');
const express = require('express');
const cookieParser = require('cookie-parser');

const SECRET = process.env.JWT_SECRET;

const tokenFor = (role, opts = {}) =>
    jwt.sign({ id: 1, role, ...(opts.noOrg || role === 'PLATFORM_ADMIN' ? {} : { org: opts.org ?? 1 }) }, opts.secret || SECRET, { expiresIn: opts.expiresIn ?? 300 });

/** Crea un app Express con el router montado y lo deja escuchando en un puerto libre. */
async function startApp(mountPath, router) {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(mountPath, router);
    // Mismo manejador de errores que el gateway real
    app.use(require('../src/middleware/errorHandler.middleware'));
    const server = await new Promise(resolve => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    return { base, close: () => new Promise(r => server.close(r)) };
}

const call = (base, method, path, token, extraHeaders = {}) =>
    fetch(base + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Cookie: `token=${token}` } : {}),
            ...extraHeaders
        },
        body: ['POST', 'PUT'].includes(method) ? '{}' : undefined
    });

module.exports = { SECRET, tokenFor, startApp, call };
