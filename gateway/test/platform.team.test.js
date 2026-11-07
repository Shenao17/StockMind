/** Equipo de plataforma en el gateway: todos los roles PLATFORM_* pasan, los de empresa no; el cuerpo se filtra. */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { SECRET, tokenFor, startApp } = require('./helpers');

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

const req = (method, path, token, body) => fetch(`${app.base}/api/platform${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `token=${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
});

describe('acceso al panel por rol (el permiso fino lo decide el backend)', () => {
    for (const role of ['PLATFORM_OWNER', 'PLATFORM_BILLING', 'PLATFORM_SUPPORT', 'PLATFORM_VIEWER']) {
        test(`${role} llega al backend`, async () => {
            assert.equal((await req('GET', '/organizations', tokenFor(role))).status, 200);
        });
    }
    for (const role of ['ADMIN', 'SELLER']) {
        test(`${role} de empresa → 403 también en /team`, async () => {
            assert.equal((await req('GET', '/organizations', tokenFor(role))).status, 403);
            assert.equal((await req('GET', '/team', tokenFor(role))).status, 403);
        });
    }
    test('sin sesión → 401', async () => {
        assert.equal((await req('GET', '/team')).status, 401);
    });
    test('un token de desafío (typ) no es una sesión, aunque lleve un rol de plataforma', async () => {
        const challenge = jwt.sign({ typ: 'MFA', role: 'PLATFORM_OWNER', id: 1 }, SECRET, { expiresIn: 300 });
        assert.equal((await req('GET', '/team', challenge)).status, 401);
        const noRole = jwt.sign({ typ: 'MFA', id: 1 }, SECRET, { expiresIn: 300 });
        assert.equal((await req('GET', '/organizations', noRole)).status, 401);
    });
});

describe('equipo', () => {
    const owner = () => tokenFor('PLATFORM_OWNER');

    test('alta: reenvía solo los campos esperados', async () => {
        javaCalls.length = 0;
        await req('POST', '/team', owner(), { fullName: 'Ana', email: 'a@x.com', role: 'PLATFORM_SUPPORT', pin: '482915', active: true, passwordHash: 'x' });
        assert.deepEqual(javaCalls[0], { method: 'POST', url: '/platform/team',
            body: { fullName: 'Ana', email: 'a@x.com', role: 'PLATFORM_SUPPORT', pin: '482915' } });
    });

    test('edición y reinicio: id numérico y cuerpo filtrado', async () => {
        javaCalls.length = 0;
        await req('PATCH', '/team/7', owner(), { role: 'PLATFORM_VIEWER', active: false, pin: '482915', organizationId: 9 });
        assert.deepEqual(javaCalls[0], { method: 'PATCH', url: '/platform/team/7',
            body: { role: 'PLATFORM_VIEWER', active: false, pin: '482915' } });
        javaCalls.length = 0;
        await req('POST', '/team/7/reset-access', owner(), { pin: '482915', x: 1 });
        assert.deepEqual(javaCalls[0], { method: 'POST', url: '/platform/team/7/reset-access', body: { pin: '482915' } });

        javaCalls.length = 0;
        assert.equal((await req('PATCH', '/team/abc', owner(), {})).status, 400);
        assert.equal((await req('POST', '/team/1;drop/reset-access', owner(), {})).status, 400);
        assert.equal(javaCalls.length, 0);
    });
});

describe('ficha de empresa', () => {
    const owner = () => tokenFor('PLATFORM_OWNER');

    test('el detalle y las correcciones llegan a Java con id válido y solo los campos permitidos', async () => {
        javaCalls.length = 0;
        assert.equal((await req('GET', '/organizations/12/detail', owner())).status, 200);
        assert.deepEqual(javaCalls[0], { method: 'GET', url: '/platform/organizations/12/detail', body: null });

        javaCalls.length = 0;
        await req('PATCH', '/organizations/12/contact', owner(), { name: 'N', legalName: 'L', phone: '3001234567',
            contactEmail: 'a@b.com', country: 'CO', taxId: '1', status: 'ACTIVE', requireMfa: true });
        assert.deepEqual(javaCalls[0], { method: 'PATCH', url: '/platform/organizations/12/contact',
            body: { name: 'N', legalName: 'L', phone: '3001234567', contactEmail: 'a@b.com', country: 'CO' } });

        javaCalls.length = 0;
        await req('PATCH', '/organizations/12/tax-id', owner(), { taxId: '900123456-7', pin: '482915', name: 'x' });
        assert.deepEqual(javaCalls[0], { method: 'PATCH', url: '/platform/organizations/12/tax-id',
            body: { taxId: '900123456-7', pin: '482915' } });
    });

    test('ids no numéricos no llegan a Java; las empresas no entran', async () => {
        javaCalls.length = 0;
        for (const p of ['/organizations/abc/detail', '/organizations/1;x/contact', '/organizations/../tax-id']) {
            const m = p.endsWith('detail') ? 'GET' : 'PATCH';
            const r = await req(m, p, owner(), m === 'PATCH' ? {} : undefined);
            assert.ok([400, 404].includes(r.status), `${m} ${p} → ${r.status}`);
        }
        assert.equal(javaCalls.length, 0);
        assert.equal((await req('GET', '/organizations/12/detail', tokenFor('ADMIN'))).status, 403);
        assert.equal((await req('PATCH', '/organizations/12/tax-id', tokenFor('SELLER'), {})).status, 403);
    });
});

describe('resumen, cobros y auditoría', () => {
    const owner = () => tokenFor('PLATFORM_OWNER');

    test('llegan a Java; cobros y auditoría solo con los filtros conocidos', async () => {
        javaCalls.length = 0;
        assert.equal((await req('GET', '/summary', owner())).status, 200);
        assert.equal(javaCalls[0].url, '/platform/summary');

        javaCalls.length = 0;
        await req('GET', '/payments?status=PAID&search=alfa&page=1&size=10&from=2026-11-01&hack=1&sort=amountTotal', owner());
        const u = new URL(javaCalls[0].url, 'http://x');
        assert.equal(u.pathname, '/platform/payments');
        assert.deepEqual(Object.fromEntries(u.searchParams),
            { status: 'PAID', search: 'alfa', page: '1', size: '10', from: '2026-11-01', sort: 'amountTotal' });

        javaCalls.length = 0;
        await req('GET', '/audit?action=PLAN_CHANGED&actor=ana&organizationId=3&x=y', owner());
        const a = new URL(javaCalls[0].url, 'http://x');
        assert.equal(a.pathname, '/platform/audit');
        assert.deepEqual(Object.fromEntries(a.searchParams), { action: 'PLAN_CHANGED', actor: 'ana', organizationId: '3' });
    });

    test('exigen rol de plataforma', async () => {
        for (const p of ['/summary', '/payments', '/audit']) {
            assert.equal((await req('GET', p)).status, 401, p);
            assert.equal((await req('GET', p, tokenFor('ADMIN'))).status, 403, p);
        }
    });
});

describe('solicitudes y planes', () => {
    const owner = () => tokenFor('PLATFORM_OWNER');
    const support = () => tokenFor('PLATFORM_SUPPORT');

    test('crear una solicitud reenvía solo los campos esperados', async () => {
        javaCalls.length = 0;
        await req('POST', '/requests', support(), { type: 'SUSPEND', organizationId: 3, reason: 'motivo largo', params: { days: 3 }, status: 'APPROVED', requestedBy: 'otro' });
        assert.deepEqual(javaCalls[0], { method: 'POST', url: '/platform/requests',
            body: { type: 'SUSPEND', organizationId: 3, reason: 'motivo largo', params: { days: 3 } } });
    });

    test('listar usa solo filtros conocidos; aprobar, rechazar y cancelar filtran el cuerpo y validan el id', async () => {
        javaCalls.length = 0;
        await req('GET', '/requests?status=PENDING&type=CANCEL&organizationId=3&page=0&hack=1', owner());
        const u = new URL(javaCalls[0].url, 'http://x');
        assert.equal(u.pathname, '/platform/requests');
        assert.deepEqual(Object.fromEntries(u.searchParams), { status: 'PENDING', type: 'CANCEL', organizationId: '3', page: '0' });

        javaCalls.length = 0;
        await req('POST', '/requests/5/approve', owner(), { pin: '482915', note: 'ok', status: 'APPROVED' });
        assert.deepEqual(javaCalls[0], { method: 'POST', url: '/platform/requests/5/approve', body: { pin: '482915', note: 'ok' } });
        javaCalls.length = 0;
        await req('POST', '/requests/5/reject', owner(), { note: 'no procede', pin: '1' });
        assert.deepEqual(javaCalls[0].body, { note: 'no procede' });
        javaCalls.length = 0;
        await req('POST', '/requests/5/cancel', support(), { x: 1 });
        assert.deepEqual(javaCalls[0], { method: 'POST', url: '/platform/requests/5/cancel', body: {} });

        javaCalls.length = 0;
        assert.equal((await req('POST', '/requests/abc/approve', owner(), {})).status, 400);
        assert.equal((await req('POST', '/requests/5/delete', owner(), {})).status, 404);
        assert.equal(javaCalls.length, 0);
    });

    test('el editor de planes filtra el cuerpo y valida el código', async () => {
        javaCalls.length = 0;
        await req('PUT', '/plans/PRO', owner(), { name: 'Pro', priceMonthly: 129900, priceYearly: 1299000, maxUsers: 6, maxProducts: 3000,
            extraUserPrice: 15000, active: true, features: ['REPORTS'], pin: '482915', code: 'OTRO', sortOrder: 9 });
        assert.deepEqual(javaCalls[0], { method: 'PUT', url: '/platform/plans/PRO', body: { name: 'Pro', priceMonthly: 129900,
            priceYearly: 1299000, maxUsers: 6, maxProducts: 3000, extraUserPrice: 15000, active: true, features: ['REPORTS'], pin: '482915' } });
        javaCalls.length = 0;
        assert.equal((await req('PUT', '/plans/PR%20O;x', owner(), {})).status, 400);
        assert.equal((await req('GET', '/plans', owner())).status, 200);
        assert.equal(javaCalls.length, 1);
    });

    test('las empresas no entran', async () => {
        for (const [m, p] of [['GET', '/requests'], ['POST', '/requests'], ['GET', '/plans'], ['PUT', '/plans/PRO']]) {
            assert.equal((await req(m, p, tokenFor('ADMIN'), m === 'GET' ? undefined : {})).status, 403, `${m} ${p}`);
        }
    });
});

describe('correo de prueba', () => {
    test('reenvía solo el destino y exige rol de plataforma', async () => {
        javaCalls.length = 0;
        await req('POST', '/email-test', tokenFor('PLATFORM_OWNER'), { to: 'a@b.com', from: 'otro@x.com', html: '<b>x</b>' });
        assert.deepEqual(javaCalls[0], { method: 'POST', url: '/platform/email-test', body: { to: 'a@b.com' } });
        assert.equal((await req('POST', '/email-test', tokenFor('ADMIN'), {})).status, 403);
        assert.equal((await req('POST', '/email-test', undefined, {})).status, 401);
    });
});
