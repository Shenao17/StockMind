/** Enlaces de pago públicos: solo referencias bien formadas llegan a Java. */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startApp } = require('./helpers');

let java, app;
const javaCalls = [];

before(async () => {
    java = await new Promise(resolve => {
        const s = http.createServer((req, res) => {
            javaCalls.push({ method: req.method, url: req.url });
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(req.url === '/billing/subscription'
                ? { features: ['REPORTS'], blocked: false, planName: 'Pro' } : { ok: true }));
        }).listen(0, '127.0.0.1', () => resolve(s));
    });
    process.env.JAVA_API_URL = `http://127.0.0.1:${java.address().port}`;
    app = await startApp('/api/public', require('../src/routes/public.routes').createPublicRouter({ registrationLimit: 1000 }));
});

after(async () => {
    await app.close();
    await new Promise(r => java.close(r));
});

const REF = 'abcDEF123_-abcDEF123_-abcDEF12';   // 30 caracteres válidos

describe('planes y pagos públicos', () => {
    test('GET /plans llega a Java sin sesión', async () => {
        javaCalls.length = 0;
        const r = await fetch(`${app.base}/api/public/plans`);
        assert.equal(r.status, 200);
        assert.equal(javaCalls[0].url, '/public/plans');
    });

    test('una referencia bien formada se consulta y se confirma', async () => {
        javaCalls.length = 0;
        assert.equal((await fetch(`${app.base}/api/public/payments/${REF}`)).status, 200);
        assert.equal((await fetch(`${app.base}/api/public/payments/${REF}/simulate`, { method: 'POST' })).status, 200);
        assert.deepEqual(javaCalls.map(c => `${c.method} ${c.url}`),
            [`GET /public/payments/${REF}`, `POST /public/payments/${REF}/simulate`]);
    });

    test('una referencia corta, con símbolos o con ../ no llega a Java (404)', async () => {
        javaCalls.length = 0;
        for (const bad of ['corta', 'x'.repeat(65), 'abc!@%23abc!@%23abc!@%23abc', '..%2F..%2Fhealth']) {
            const r = await fetch(`${app.base}/api/public/payments/${bad}`);
            assert.equal(r.status, 404, `"${bad}" debería rechazarse`);
            const s = await fetch(`${app.base}/api/public/payments/${bad}/simulate`, { method: 'POST' });
            assert.equal(s.status, 404);
        }
        assert.equal(javaCalls.length, 0);
    });

    test('confirmar un pago limpia la caché de funciones del plan (el plan nuevo se ve de inmediato)', async () => {
        const feature = require('../src/middleware/feature.middleware');
        feature.__clearCache();
        const run = () => new Promise(resolve =>
            feature.requireFeature('REPORTS')({ user: { org: 3 }, cookies: { token: 't' } }, {}, resolve));
        const subscriptionCalls = () => javaCalls.filter(c => c.url === '/billing/subscription').length;

        javaCalls.length = 0;
        await run(); await run();
        assert.equal(subscriptionCalls(), 1, 'la segunda se atiende desde la caché');

        await fetch(`${app.base}/api/public/payments/${REF}/simulate`, { method: 'POST' });
        await run();
        assert.equal(subscriptionCalls(), 2, 'tras el pago se vuelve a consultar el plan');
    });
});
