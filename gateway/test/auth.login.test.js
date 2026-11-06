/**
 * POST /api/auth/login del gateway: el JWT viaja SOLO en cookie httpOnly y el frontend
 * recibe los datos del usuario (con correo y empresa) sin el token.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startApp } = require('./helpers');

let java, app;
let lastBody = null;
let mode = 'ok';

before(async () => {
    java = await new Promise(resolve => {
        const s = http.createServer((req, res) => {
            let raw = '';
            req.on('data', c => { raw += c; });
            req.on('end', () => {
                lastBody = raw ? JSON.parse(raw) : null;
                res.setHeader('Content-Type', 'application/json');
                if (mode === 'bad') { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Credenciales inválidas' })); }
                if (mode === 'down') { res.statusCode = 500; return res.end(JSON.stringify({ error: 'SQL interno' })); }
                res.end(JSON.stringify({
                    token: 'jwt-de-prueba', userId: 5, username: 'ana', email: 'ana@empresa.com',
                    organizationId: 3, role: 'ADMIN'
                }));
            });
        }).listen(0, '127.0.0.1', () => resolve(s));
    });
    process.env.JAVA_API_URL = `http://127.0.0.1:${java.address().port}`;
    app = await startApp('/api/auth', require('../src/routes/auth.routes'));
});

after(async () => {
    await app.close();
    await new Promise(r => java.close(r));
});

const login = (body) => fetch(`${app.base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});

describe('login', () => {
    test('reenvía correo y contraseña a Java', async () => {
        mode = 'ok';
        await login({ email: 'ana@empresa.com', password: 'Clave1234' });
        assert.deepEqual(lastBody, { email: 'ana@empresa.com', password: 'Clave1234' });
    });

    test('el token va en cookie httpOnly y NO en el cuerpo', async () => {
        mode = 'ok';
        const r = await login({ email: 'ana@empresa.com', password: 'x' });
        assert.equal(r.status, 200);
        const body = await r.json();
        assert.equal(JSON.stringify(body).includes('jwt-de-prueba'), false);
        assert.deepEqual(body.user, {
            id: 5, username: 'ana', email: 'ana@empresa.com', organizationId: 3, role: 'ADMIN'
        });
        const cookie = r.headers.get('set-cookie');
        assert.match(cookie, /^token=jwt-de-prueba/);
        assert.match(cookie, /HttpOnly/i);
        assert.match(cookie, /SameSite=/i);
    });

    test('credenciales incorrectas → mensaje genérico y sin cookie', async () => {
        mode = 'bad';
        const r = await login({ email: 'ana@empresa.com', password: 'mal' });
        assert.equal(r.status, 401);
        assert.equal((await r.json()).error, 'Usuario o contraseña incorrectos.');
        assert.equal(r.headers.get('set-cookie'), null);
    });

    test('error 5xx de Java → 503 sin detalles internos', async () => {
        mode = 'down';
        const r = await login({ email: 'ana@empresa.com', password: 'x' });
        assert.equal(r.status, 503);
        assert.equal(JSON.stringify(await r.json()).includes('SQL'), false);
    });
});
