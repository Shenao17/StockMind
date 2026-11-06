const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { tokenFor, SECRET } = require('./helpers');
const { authenticate, requireRole } = require('../src/middleware/auth.middleware');

function run(mw, req) {
    return new Promise(resolve => {
        const res = {
            statusCode: 200,
            status(c) { this.statusCode = c; return this; },
            json(body) { resolve({ status: this.statusCode, body, nextCalled: false, req }); }
        };
        mw(req, res, () => resolve({ status: 200, body: null, nextCalled: true, req }));
    });
}

describe('authenticate', () => {
    test('sin cookie → 401 NO_TOKEN', async () => {
        const r = await run(authenticate, { cookies: {}, headers: {} });
        assert.equal(r.status, 401);
        assert.equal(r.body.code, 'NO_TOKEN');
    });

    test('un header Authorization NO sustituye a la cookie', async () => {
        const r = await run(authenticate, {
            cookies: {},
            headers: { authorization: `Bearer ${tokenFor('ADMIN')}` }
        });
        assert.equal(r.status, 401);
    });

    test('cookie válida → continúa y adjunta req.user', async () => {
        const r = await run(authenticate, { cookies: { token: tokenFor('SELLER') } });
        assert.equal(r.nextCalled, true);
        assert.equal(r.req.user.role, 'SELLER');
    });

    test('token expirado → 401 TOKEN_EXPIRED', async () => {
        const r = await run(authenticate, { cookies: { token: tokenFor('ADMIN', { expiresIn: -10 }) } });
        assert.equal(r.status, 401);
        assert.equal(r.body.code, 'TOKEN_EXPIRED');
    });

    test('token firmado con otro secreto → 401 INVALID_TOKEN', async () => {
        const r = await run(authenticate, {
            cookies: { token: tokenFor('ADMIN', { secret: 'otro-secreto-distinto-de-32-caracteres-o-mas' }) }
        });
        assert.equal(r.status, 401);
        assert.equal(r.body.code, 'INVALID_TOKEN');
    });

    test('token de ADMIN/SELLER sin empresa (org) → 401 para forzar nuevo login', async () => {
        const r = await run(authenticate, { cookies: { token: tokenFor('ADMIN', { noOrg: true }) } });
        assert.equal(r.status, 401);
        assert.equal(r.body.code, 'INVALID_TOKEN');
    });

    test('PLATFORM_OWNER no necesita empresa', async () => {
        const r = await run(authenticate, { cookies: { token: tokenFor('PLATFORM_OWNER') } });
        assert.equal(r.nextCalled, true);
    });

    test('el token conserva la empresa en req.user', async () => {
        const r = await run(authenticate, { cookies: { token: tokenFor('SELLER') } });
        assert.equal(r.req.user.org, 1);
    });

    test('basura en la cookie → 401 INVALID_TOKEN', async () => {
        const r = await run(authenticate, { cookies: { token: 'no.es.un.jwt' } });
        assert.equal(r.status, 401);
        assert.equal(r.body.code, 'INVALID_TOKEN');
    });
});

describe('requireRole', () => {
    test('sin req.user → 401', async () => {
        const r = await run(requireRole('ADMIN'), {});
        assert.equal(r.status, 401);
    });

    test('rol permitido → continúa', async () => {
        const r = await run(requireRole('ADMIN'), { user: { role: 'ADMIN' } });
        assert.equal(r.nextCalled, true);
    });

    test('rol no permitido → 403 INSUFFICIENT_ROLE', async () => {
        const r = await run(requireRole('ADMIN'), { user: { role: 'SELLER' } });
        assert.equal(r.status, 403);
        assert.equal(r.body.code, 'INSUFFICIENT_ROLE');
    });

    test('acepta varios roles', async () => {
        const r = await run(requireRole('ADMIN', 'SELLER'), { user: { role: 'SELLER' } });
        assert.equal(r.nextCalled, true);
    });
});

test('el secreto de pruebas cumple el mínimo de longitud', () => {
    assert.ok(SECRET.length >= 32);
});
