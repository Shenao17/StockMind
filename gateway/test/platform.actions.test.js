/** Acciones del panel de plataforma: ids válidos, acciones permitidas y cuerpo filtrado. */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { tokenFor, startApp } = require('./helpers');

let java, app;
const javaCalls = [];

before(async () => {
    java = await new Promise(resolve => {
        const s = http.createServer((req, res) => {
            let raw = '';
            req.on('data', c => { raw += c; });
            req.on('end', () => {
                javaCalls.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : null });
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

const owner = () => tokenFor('PLATFORM_OWNER');
const post = (path, body, token = owner()) => fetch(`${app.base}/api/platform${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` }, body: JSON.stringify(body ?? {})
});

describe('acciones sobre una empresa', () => {
    test('cada acción llega a Java con su ruta y solo con los campos permitidos', async () => {
        const cases = [
            ['suspend', { x: 1 }, {}],
            ['reactivate', {}, {}],
            ['cancel', {}, {}],
            ['extend-trial', { days: 7, hack: true }, { days: 7 }],
            ['plan', { planCode: 'PRO', billingCycle: 'YEARLY', complimentary: true, status: 'ACTIVE' }, { planCode: 'PRO', billingCycle: 'YEARLY', complimentary: true }],
            ['payment-links', { planCode: 'PRO', amountTotal: 1 }, { planCode: 'PRO' }],
            ['manual-payment', { planCode: 'PRO', billingCycle: 'MONTHLY', paidAt: 'ayer' }, { planCode: 'PRO', billingCycle: 'MONTHLY' }],
        ];
        for (const [action, sent, expected] of cases) {
            javaCalls.length = 0;
            const r = await post(`/organizations/12/${action}`, sent);
            assert.equal(r.status, 200, action);
            assert.equal(javaCalls[0].url, `/platform/organizations/12/${action}`);
            assert.deepEqual(javaCalls[0].body, expected, action);
        }
    });

    test('una acción desconocida o un id no numérico no llegan a Java', async () => {
        javaCalls.length = 0;
        assert.equal((await post('/organizations/12/delete-everything')).status, 404);
        assert.equal((await post('/organizations/12/__proto__')).status, 404);
        assert.equal((await post('/organizations/abc/suspend')).status, 400);
        assert.equal((await post('/organizations/1%2F..%2Fusers/suspend')).status, 400);
        assert.equal(javaCalls.length, 0);
    });

    test('el alta reenvía el plan y el modo, pero no estados ni ids', async () => {
        javaCalls.length = 0;
        await post('/organizations', {
            companyName: 'C', taxId: '900123456-7', adminEmail: 'a@c.com', password: 'Clave1234',
            planCode: 'BUSINESS', mode: 'PAID', billingCycle: 'YEARLY', status: 'ACTIVE', id: 3
        });
        assert.deepEqual(Object.keys(javaCalls[0].body).sort(),
            ['adminEmail', 'billingCycle', 'companyName', 'mode', 'password', 'planCode', 'taxId']);
    });

    test('un ADMIN de empresa no puede usar ninguna acción', async () => {
        javaCalls.length = 0;
        for (const a of ['suspend', 'cancel', 'extend-trial', 'plan']) {
            assert.equal((await post(`/organizations/12/${a}`, {}, tokenFor('ADMIN'))).status, 403);
        }
        assert.equal(javaCalls.length, 0);
    });
});
