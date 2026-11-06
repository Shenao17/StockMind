/** Rutas de plataforma: solo PLATFORM_OWNER; el alta solo reenvía los campos esperados. */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { tokenFor, startApp, call } = require('./helpers');

let java, app;
const javaCalls = [];

before(async () => {
    java = await new Promise(resolve => {
        const s = http.createServer((req, res) => {
            let raw = '';
            req.on('data', c => { raw += c; });
            req.on('end', () => {
                javaCalls.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
                res.statusCode = req.method === 'POST' ? 201 : 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: true }));
            });
        }).listen(0, '127.0.0.1', () => resolve(s));
    });
    process.env.JAVA_API_URL = `http://127.0.0.1:${java.address().port}`;
    app = await startApp('/api/platform', require('../src/routes/platform.routes'));
});

after(async () => {
    await app.close();
    await new Promise(r => java.close(r));
});

describe('acceso', () => {
    for (const [method, path] of [['GET', '/api/platform/organizations'], ['POST', '/api/platform/organizations']]) {
        test(`${method} ${path}: sin sesión → 401`, async () => {
            assert.equal((await call(app.base, method, path, null)).status, 401);
        });
        for (const role of ['ADMIN', 'SELLER']) {
            test(`${method} ${path}: ${role} de una empresa → 403`, async () => {
                javaCalls.length = 0;
                assert.equal((await call(app.base, method, path, tokenFor(role))).status, 403);
                assert.equal(javaCalls.length, 0);
            });
        }
        test(`${method} ${path}: PLATFORM_OWNER pasa`, async () => {
            const r = await call(app.base, method, path, tokenFor('PLATFORM_OWNER'));
            assert.ok([200, 201].includes(r.status), `got ${r.status}`);
        });
    }
});

describe('reenvío', () => {
    test('el alta reenvía solo los campos esperados y la sesión del dueño', async () => {
        javaCalls.length = 0;
        const token = tokenFor('PLATFORM_OWNER');
        await fetch(`${app.base}/api/platform/organizations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
            body: JSON.stringify({
                companyName: 'Cliente', taxId: '900123456-7', adminEmail: 'a@cliente.com', password: 'Clave1234',
                status: 'ACTIVE', origin: 'SELF_SIGNUP', id: 99
            })
        });
        assert.equal(javaCalls[0].url, '/platform/organizations');
        assert.equal(javaCalls[0].auth, `Bearer ${token}`);
        assert.deepEqual(Object.keys(javaCalls[0].body).sort(), ['adminEmail', 'companyName', 'password', 'taxId']);
    });

    test('el listado reenvía los parámetros de búsqueda y paginación', async () => {
        javaCalls.length = 0;
        await call(app.base, 'GET', '/api/platform/organizations?page=1&size=5&status=PENDING', tokenFor('PLATFORM_OWNER'));
        assert.match(javaCalls[0].url, /page=1/);
        assert.match(javaCalls[0].url, /status=PENDING/);
    });
});
