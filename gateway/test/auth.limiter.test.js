/**
 * Límite de intentos de acceso: solo cuentan los FALLIDOS. Entrar bien o consultar el perfil/2FA
 * no agota el límite; adivinar contraseñas o códigos sí.
 */
process.env.FRONTEND_URL = 'http://localhost:5173';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { tokenFor } = require('./helpers');

let java, server, base;
let loginOk = true;

before(async () => {
    java = await new Promise(resolve => {
        const s = http.createServer((req, res) => {
            res.setHeader('Content-Type', 'application/json');
            if (req.url === '/auth/login') {
                if (!loginOk) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Credenciales inválidas' })); }
                return res.end(JSON.stringify({ token: 'x', userId: 1, username: 'a', email: 'a@b.com', organizationId: 1, role: 'ADMIN' }));
            }
            if (req.url === '/auth/mfa/verify') { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Código incorrecto' })); }
            res.end(JSON.stringify({ enabled: false }));
        }).listen(0, '127.0.0.1', () => resolve(s));
    });
    process.env.JAVA_API_URL = `http://127.0.0.1:${java.address().port}`;
    const { createApp } = require('../app');
    server = await new Promise(resolve => { const s = createApp({ authMax: 3 }).listen(0, '127.0.0.1', () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise(r => server.close(r));
    await new Promise(r => java.close(r));
});

const post = (path, body) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});

describe('límite de intentos fallidos', () => {
    test('los accesos correctos no gastan el límite (se puede entrar más veces que el máximo)', async () => {
        loginOk = true;
        for (let i = 0; i < 8; i++) {
            assert.equal((await post('/api/auth/login', { email: 'a@b.com', password: 'x' })).status, 200, `intento ${i}`);
        }
    });

    test('consultar el estado del 2FA (Seguridad) no cuenta aunque se repita', async () => {
        const token = tokenFor('ADMIN');
        for (let i = 0; i < 10; i++) {
            const r = await fetch(`${base}/api/auth/mfa/self/status`, { headers: { Cookie: `token=${token}` } });
            assert.equal(r.status, 200, `consulta ${i}`);
        }
    });

    test('los intentos fallidos sí cuentan: al llegar al máximo responde 429', async () => {
        loginOk = false;
        const statuses = [];
        for (let i = 0; i < 5; i++) statuses.push((await post('/api/auth/login', { email: 'a@b.com', password: 'mala' })).status);
        assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
    });

    test('login y códigos de 2FA comparten el mismo contador por IP (no se burla el límite cambiando de ruta)', async () => {
        // el contador ya se agotó con los fallos de login del caso anterior
        const r = await post('/api/auth/mfa/verify', { challengeToken: 't', code: '000000' });
        assert.equal(r.status, 429);
    });
});
