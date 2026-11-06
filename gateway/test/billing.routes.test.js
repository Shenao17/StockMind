/** Rutas de plan/pagos de la empresa, control de funciones por plan y enlaces de pago públicos. */
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { tokenFor, startApp, call } = require('./helpers');

let java, app;
const javaCalls = [];
let subscriptionReply;

before(async () => {
    java = await new Promise(resolve => {
        const s = http.createServer((req, res) => {
            let raw = '';
            req.on('data', c => { raw += c; });
            req.on('end', () => {
                javaCalls.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
                res.setHeader('Content-Type', 'application/json');
                if (req.url === '/billing/subscription') return res.end(JSON.stringify(subscriptionReply));
                res.statusCode = req.method === 'POST' ? 201 : 200;
                res.end(JSON.stringify({ ok: true }));
            });
        }).listen(0, '127.0.0.1', () => resolve(s));
    });
    process.env.JAVA_API_URL = `http://127.0.0.1:${java.address().port}`;
    app = await startApp('/api/billing', require('../src/routes/billing.routes'));
});

after(async () => {
    await app.close();
    await new Promise(r => java.close(r));
});

beforeEach(() => {
    javaCalls.length = 0;
    subscriptionReply = { planCode: 'PRO', planName: 'Pro', status: 'ACTIVE', features: ['REPORTS', 'PREDICTIONS'], blocked: false };
});

describe('/api/billing', () => {
    test('sin sesión → 401', async () => {
        assert.equal((await call(app.base, 'GET', '/api/billing/subscription', null)).status, 401);
    });

    test('PLATFORM_ADMIN (sin empresa) → 403', async () => {
        const r = await call(app.base, 'GET', '/api/billing/subscription', tokenFor('PLATFORM_ADMIN'));
        assert.equal(r.status, 403);
        assert.equal(javaCalls.length, 0);
    });

    test('un SELLER puede ver el plan y los planes, pero no el historial ni crear cobros', async () => {
        const t = tokenFor('SELLER');
        assert.equal((await call(app.base, 'GET', '/api/billing/subscription', t)).status, 200);
        assert.equal((await call(app.base, 'GET', '/api/billing/plans', t)).status, 200);
        assert.equal((await call(app.base, 'GET', '/api/billing/payments', t)).status, 403);
        assert.equal((await call(app.base, 'POST', '/api/billing/checkout', t)).status, 403);
    });

    test('ADMIN crea el cobro: solo viajan plan y ciclo, con su sesión', async () => {
        const token = tokenFor('ADMIN');
        const r = await fetch(`${app.base}/api/billing/checkout`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
            body: JSON.stringify({ planCode: 'PRO', billingCycle: 'YEARLY', amountTotal: 1, status: 'PAID', organizationId: 9 })
        });
        assert.equal(r.status, 201);
        assert.deepEqual(javaCalls[0].body, { planCode: 'PRO', billingCycle: 'YEARLY' });
        assert.equal(javaCalls[0].auth, `Bearer ${token}`);
    });
});

describe('control de funciones por plan (requireFeature)', () => {
    // Se cargan al ejecutar cada prueba (después de fijar JAVA_API_URL), no al definir el bloque
    const feature = () => require('../src/middleware/feature.middleware');

    async function run(name, org = 1) {
        const { requireFeature, __clearCache } = feature();
        __clearCache();
        const req = { user: { org }, cookies: { token: 'abc' } };
        return new Promise(resolve => {
            const res = { status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
            requireFeature(name)(req, res, (err) => resolve({ next: true, err }));
        });
    }

    test('deja pasar si el plan incluye la función', async () => {
        assert.equal((await run('PREDICTIONS')).next, true);
    });

    test('402 FEATURE_NOT_IN_PLAN si el plan no la incluye', async () => {
        subscriptionReply = { planName: 'Starter', features: [], blocked: false };
        const r = await run('PREDICTIONS');
        assert.equal(r.status, 402);
        assert.equal(r.body.code, 'FEATURE_NOT_IN_PLAN');
        assert.match(r.body.error, /Starter/);
    });

    test('402 SUBSCRIPTION_BLOCKED si la cuenta está suspendida', async () => {
        subscriptionReply = { planName: 'Pro', features: ['PREDICTIONS'], blocked: true };
        const r = await run('PREDICTIONS');
        assert.equal(r.status, 402);
        assert.equal(r.body.code, 'SUBSCRIPTION_BLOCKED');
    });

    test('guarda el resultado unos segundos por empresa (no consulta Java en cada petición)', async () => {
        const { requireFeature, __clearCache } = feature();
        __clearCache();
        const make = () => ({ user: { org: 5 }, cookies: { token: 'abc' } });
        const pass = () => new Promise(resolve => requireFeature('REPORTS')(make(), {}, () => resolve(true)));
        javaCalls.length = 0;
        await pass(); await pass(); await pass();
        assert.equal(javaCalls.filter(c => c.url === '/billing/subscription').length, 1);
    });

    test('falla cerrado: si Java no responde, la petición NO pasa', async () => {
        const { requireFeature, __clearCache } = feature();
        __clearCache();
        const saved = require('../src/config/config').javaApiUrl;
        require('../src/config/config').javaApiUrl = 'http://127.0.0.1:9';
        try {
            const r = await new Promise(resolve => {
                requireFeature('PREDICTIONS')({ user: { org: 77 }, cookies: { token: 'abc' } }, {}, (err) => resolve({ err }));
            });
            assert.ok(r.err, 'debe propagar el error en vez de dejar pasar');
        } finally {
            require('../src/config/config').javaApiUrl = saved;
        }
    });
});
