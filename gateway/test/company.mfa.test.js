/** 2FA de empresas en el gateway: autoservicio, política del admin, reinicios y filtrado de cuerpos. */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');
const { tokenFor, startApp } = require('./helpers');

let java, authApp, usersApp, platformApp;
const javaCalls = [];
let nextStatus = 200;

before(async () => {
    java = await new Promise(resolve => {
        const s = http.createServer((req, res) => {
            let raw = '';
            req.on('data', c => { raw += c; });
            req.on('end', () => {
                javaCalls.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : null });
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = nextStatus;
                res.end(JSON.stringify(nextStatus === 200 ? { ok: true } : { error: 'La contraseña no es correcta' }));
            });
        }).listen(0, '127.0.0.1', () => resolve(s));
    });
    process.env.JAVA_API_URL = `http://127.0.0.1:${java.address().port}`;
    authApp = await startApp('/api/auth', require('../src/routes/auth.routes'));
    usersApp = await startApp('/api/users', require('../src/routes/users.routes'));
    platformApp = await startApp('/api/platform', require('../src/routes/platform.routes'));
});

after(async () => {
    await authApp.close(); await usersApp.close(); await platformApp.close();
    await new Promise(r => java.close(r));
});

const req = (app, method, path, token, body) => fetch(`${app.base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `token=${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
});

describe('autoservicio del 2FA (perfil)', () => {
    test('exige sesión de empresa: sin sesión 401; el equipo de plataforma 403', async () => {
        assert.equal((await req(authApp, 'GET', '/api/auth/mfa/self/status')).status, 401);
        assert.equal((await req(authApp, 'GET', '/api/auth/mfa/self/status', tokenFor('PLATFORM_OWNER'))).status, 403);
        assert.equal((await req(authApp, 'POST', '/api/auth/mfa/self/disable', tokenFor('PLATFORM_OWNER'), {})).status, 403);
    });

    test('cada ruta llega a Java solo con sus campos', async () => {
        nextStatus = 200;
        const cases = [
            ['/mfa/self/setup/start', { password: 'Clave1234', extra: 1 }, { password: 'Clave1234' }],
            ['/mfa/self/setup/finish', { code: '123456', role: 'ADMIN' }, { code: '123456' }],
            ['/mfa/self/disable', { password: 'Clave1234', code: '123456', x: 1 }, { password: 'Clave1234', code: '123456' }],
        ];
        for (const [path, sent, expected] of cases) {
            javaCalls.length = 0;
            const r = await req(authApp, 'POST', `/api/auth${path}`, tokenFor('SELLER'), sent);
            assert.equal(r.status, 200, path);
            assert.equal(javaCalls[0].url, `/auth${path}`);
            assert.deepEqual(javaCalls[0].body, expected, path);
        }
        javaCalls.length = 0;
        assert.equal((await req(authApp, 'GET', '/api/auth/mfa/self/status', tokenFor('ADMIN'))).status, 200);
        assert.equal(javaCalls[0].url, '/auth/mfa/self/status');
    });

    test('un error de validación (contraseña incorrecta) llega al usuario sin cerrar la sesión', async () => {
        nextStatus = 400;
        const r = await req(authApp, 'POST', '/api/auth/mfa/self/disable', tokenFor('SELLER'), { password: 'x', code: '1' });
        nextStatus = 200;
        assert.equal(r.status, 400);
        assert.equal((await r.json()).error, 'La contraseña no es correcta');
    });
});

describe('política y reinicio en la empresa (solo ADMIN)', () => {
    test('un vendedor no ve ni cambia la política ni reinicia a nadie', async () => {
        const seller = tokenFor('SELLER');
        assert.equal((await req(usersApp, 'GET', '/api/users/mfa-policy', seller)).status, 403);
        assert.equal((await req(usersApp, 'PUT', '/api/users/mfa-policy', seller, { required: true })).status, 403);
        assert.equal((await req(usersApp, 'POST', '/api/users/5/reset-mfa', seller, {})).status, 403);
    });

    test('el admin lee y cambia la política (solo "required") y reinicia a un compañero', async () => {
        const admin = tokenFor('ADMIN');
        javaCalls.length = 0;
        await req(usersApp, 'PUT', '/api/users/mfa-policy', admin, { required: true, role: 'ADMIN' });
        assert.deepEqual(javaCalls[0], { method: 'PUT', url: '/users/mfa-policy', body: { required: true } });
        javaCalls.length = 0;
        await req(usersApp, 'GET', '/api/users/mfa-policy', admin);
        assert.equal(javaCalls[0].url, '/users/mfa-policy');
        javaCalls.length = 0;
        await req(usersApp, 'POST', '/api/users/5/reset-mfa', admin, {});
        assert.deepEqual(javaCalls[0], { method: 'POST', url: '/users/5/reset-mfa', body: {} });
        javaCalls.length = 0;
        assert.equal((await req(usersApp, 'POST', '/api/users/abc/reset-mfa', admin, {})).status, 400);
        assert.equal(javaCalls.length, 0);
    });
});

describe('reinicio desde la plataforma', () => {
    test('reenvía solo el PIN y valida los dos ids', async () => {
        const owner = tokenFor('PLATFORM_OWNER');
        javaCalls.length = 0;
        await req(platformApp, 'POST', '/api/platform/organizations/3/users/9/reset-mfa', owner, { pin: '482915', x: 1 });
        assert.deepEqual(javaCalls[0], { method: 'POST', url: '/platform/organizations/3/users/9/reset-mfa', body: { pin: '482915' } });
        javaCalls.length = 0;
        assert.equal((await req(platformApp, 'POST', '/api/platform/organizations/3/users/x/reset-mfa', owner, {})).status, 400);
        assert.equal((await req(platformApp, 'POST', '/api/platform/organizations/3/users/9/reset-mfa', tokenFor('ADMIN'), {})).status, 403);
        assert.equal(javaCalls.length, 0);
    });
});
