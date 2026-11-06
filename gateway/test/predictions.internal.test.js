/**
 * El gateway debe decirle a analytics QUÉ empresa es (del token verificado) y
 * autenticarse con la clave interna; nunca debe confiar en lo que mande el cliente.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { tokenFor, startApp, call } = require('./helpers');

// "Analytics" falso: guarda las cabeceras y la ruta que recibe
const received = [];
let upstream;
let javaFake;
let app;

before(async () => {
    upstream = await new Promise(resolve => {
        const s = http.createServer((req, res) => {
            received.push({ url: req.url, headers: req.headers });
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
        }).listen(0, '127.0.0.1', () => resolve(s));
    });
    // Las predicciones exigen la función PREDICTIONS en el plan: un "Java" falso responde que la incluye
    javaFake = await new Promise(resolve => {
        const s = http.createServer((req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ features: ['PREDICTIONS'], blocked: false, planName: 'Pro' }));
        }).listen(0, '127.0.0.1', () => resolve(s));
    });
    // config se carga en el primer require de las rutas: los upstreams se fijan antes
    process.env.JAVA_API_URL = `http://127.0.0.1:${javaFake.address().port}`;
    process.env.PYTHON_API_URL = `http://127.0.0.1:${upstream.address().port}`;
    app = await startApp('/api/predictions', require('../src/routes/predictions.routes'));
});

after(async () => {
    await app.close();
    await new Promise(r => upstream.close(r));
    await new Promise(r => javaFake.close(r));
});

describe('gateway → analytics', () => {
    test('envía la empresa del token y la clave interna', async () => {
        received.length = 0;
        const r = await call(app.base, 'GET', '/api/predictions/recommendations', tokenFor('SELLER', { org: 7 }));
        assert.equal(r.status, 200);
        assert.equal(received.length, 1);
        assert.equal(received[0].url, '/recommend');
        assert.equal(received[0].headers['x-organization-id'], '7');
        assert.equal(received[0].headers['x-internal-key'], process.env.INTERNAL_API_KEY);
    });

    test('ignora una empresa enviada por el cliente: manda siempre la del token', async () => {
        received.length = 0;
        await call(app.base, 'GET', '/api/predictions/12', tokenFor('ADMIN', { org: 3 }), {
            'X-Organization-Id': '99', 'X-Internal-Key': 'inventada'
        });
        assert.equal(received[0].url, '/predict/12');
        assert.equal(received[0].headers['x-organization-id'], '3');
        assert.equal(received[0].headers['x-internal-key'], process.env.INTERNAL_API_KEY);
    });

    test('un PLATFORM_OWNER (sin empresa) no puede consultar predicciones', async () => {
        received.length = 0;
        const r = await call(app.base, 'GET', '/api/predictions/recommendations', tokenFor('PLATFORM_OWNER'));
        assert.equal(r.status, 403);
        assert.equal((await r.json()).code, 'ORGANIZATION_REQUIRED');
        assert.equal(received.length, 0, 'no debe llegar nada a analytics');
    });

    test('un id de producto que no es numérico no llega a analytics', async () => {
        received.length = 0;
        for (const bad of ['abc', '1%2F..%2Fhealth', '1;drop', '12345678901234567890123']) {
            const r = await call(app.base, 'GET', `/api/predictions/${bad}`, tokenFor('ADMIN'));
            assert.equal(r.status, 400, `"${bad}" debería rechazarse`);
        }
        assert.equal(received.length, 0);
    });

    test('sin sesión no se llega a analytics', async () => {
        received.length = 0;
        const r = await call(app.base, 'GET', '/api/predictions/recommendations', null);
        assert.equal(r.status, 401);
        assert.equal(received.length, 0);
    });
});
