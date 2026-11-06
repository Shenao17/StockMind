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
