/**
 * Verificación en dos pasos del equipo de plataforma en el gateway: el desafío viaja en el cuerpo
 * (nunca en cookie), la sesión llega solo al terminar y la cookie dura lo que el token.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { SECRET, startApp } = require('./helpers');

let java, app;
let last = null;
let mode = 'challenge';

before(async () => {
    java = await new Promise(resolve => {
        const s = http.createServer((req, res) => {
            let raw = '';
            req.on('data', c => { raw += c; });
            req.on('end', () => {
                last = { url: req.url, body: raw ? JSON.parse(raw) : null };
                res.setHeader('Content-Type', 'application/json');
                if (mode === 'wrong') { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Código incorrecto' })); }
                if (mode === 'invalid') { res.statusCode = 400; return res.end(JSON.stringify({ error: 'El PIN debe tener entre 6 y 10 dígitos' })); }
                if (mode === 'down') { res.statusCode = 500; return res.end(JSON.stringify({ error: 'SQL interno' })); }
                if (req.url === '/auth/mfa/enroll/start') {
                    return res.end(JSON.stringify({ secret: 'ABCDEFGH', otpauthUri: 'otpauth://totp/x' }));
                }
                if (req.url === '/auth/login' && mode === 'challenge') {
                    return res.end(JSON.stringify({ mfaRequired: false, enrollmentRequired: true, mustChangePassword: true,
                        challengeToken: 'desafio-xyz', fullName: 'Sebas' }));
                }
                const session = jwt.sign({ id: 1, role: 'PLATFORM_OWNER' }, SECRET, { expiresIn: 7200 });
                res.end(JSON.stringify({ token: session, userId: 1, username: 'dueno', email: 'd@x.com', organizationId: null,
                    role: 'PLATFORM_OWNER', fullName: 'Sebas', backupCodes: ['AAAAA11111'] }));
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

const post = (path, body) => fetch(`${app.base}/api/auth${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});

describe('login del equipo de plataforma', () => {
    test('sin segundo paso devuelve el desafío en el cuerpo y NO crea cookie', async () => {
        mode = 'challenge';
        const r = await post('/login', { email: 'd@x.com', password: 'Clave1234', extra: 'x' });
        assert.equal(r.status, 200);
        assert.equal(r.headers.get('set-cookie'), null);
        const b = await r.json();
        assert.deepEqual(b.challenge, { token: 'desafio-xyz', mfaRequired: false, enrollmentRequired: true,
            mustChangePassword: true, pinRequired: false, fullName: 'Sebas' });
        assert.equal(b.user, undefined);
        assert.deepEqual(last.body, { email: 'd@x.com', password: 'Clave1234' }, 'solo se reenvían los campos esperados');
    });

    test('mfa/verify devuelve la sesión en cookie httpOnly con la duración del token (2 h)', async () => {
        mode = 'session';
        const r = await post('/mfa/verify', { challengeToken: 'desafio-xyz', code: '123456', admin: true });
        assert.equal(r.status, 200);
        const cookie = r.headers.get('set-cookie');
        assert.match(cookie, /token=/);
        assert.match(cookie, /HttpOnly/i);
        const maxAge = Number(/Max-Age=(\d+)/i.exec(cookie)[1]);
        assert.ok(maxAge > 7000 && maxAge <= 7200, `Max-Age=${maxAge}`);
        const text = JSON.stringify(await r.json());
        assert.equal(text.includes('"token"'), false);
        assert.deepEqual(last.body, { challengeToken: 'desafio-xyz', code: '123456' });
    });

    test('enroll/start devuelve secreto y URI; enroll/finish devuelve sesión y códigos de respaldo una vez', async () => {
        mode = 'session';
        const start = await post('/mfa/enroll/start', { challengeToken: 'desafio-xyz', otro: 1 });
        assert.equal(start.status, 200);
        assert.deepEqual(await start.json(), { secret: 'ABCDEFGH', otpauthUri: 'otpauth://totp/x' });

        const fin = await post('/mfa/enroll/finish', { challengeToken: 'd', code: '123456', pin: '482915', newPassword: 'NuevaClave99', role: 'X' });
        assert.equal(fin.status, 200);
        assert.deepEqual(last.body, { challengeToken: 'd', code: '123456', pin: '482915', newPassword: 'NuevaClave99' });
        const b = await fin.json();
        assert.deepEqual(b.backupCodes, ['AAAAA11111']);
        assert.equal(b.user.role, 'PLATFORM_OWNER');
    });

    test('errores: código incorrecto 401 y validación 400 con el mensaje de Java; 5xx no filtra detalles', async () => {
        mode = 'wrong';
        let r = await post('/mfa/verify', { challengeToken: 'x', code: '000000' });
        assert.equal(r.status, 401);
        assert.equal((await r.json()).error, 'Código incorrecto');
        assert.equal(r.headers.get('set-cookie'), null);

        mode = 'invalid';
        r = await post('/mfa/enroll/finish', { challengeToken: 'x', code: '1', pin: '1' });
        assert.equal(r.status, 400);

        mode = 'down';
        r = await post('/mfa/verify', { challengeToken: 'x', code: '1' });
        assert.equal(r.status, 503);
        assert.equal(JSON.stringify(await r.json()).includes('SQL'), false);
    });
});
