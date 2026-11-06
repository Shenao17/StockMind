/**
 * Rutas públicas de registro: anti-bots (honeypot, CAPTCHA, límite por IP) y whitelist de campos.
 * Java y Cloudflare son falsos: nada sale de la máquina.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startApp } = require('./helpers');


let java, app, config, captcha;
const javaCalls = [];
let javaReply = { status: 202, body: { message: 'ok-java' } };

before(async () => {
    java = await new Promise(resolve => {
        const s = http.createServer((req, res) => {
            let raw = '';
            req.on('data', c => { raw += c; });
            req.on('end', () => {
                javaCalls.push({ url: req.url, body: raw ? JSON.parse(raw) : null });
                res.statusCode = javaReply.status;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(javaReply.body));
            });
        }).listen(0, '127.0.0.1', () => resolve(s));
    });
    process.env.JAVA_API_URL = `http://127.0.0.1:${java.address().port}`;
    config = require('../src/config/config');
    captcha = require('../src/utils/captcha');
    app = await startApp('/api/public', require('../src/routes/public.routes').createPublicRouter({ registrationLimit: 1000 }));
});

after(async () => {
    await app.close();
    await new Promise(r => java.close(r));
});

const FORM = {
    companyName: 'Ferretería El Tornillo', taxId: '900123456-7', adminEmail: 'gerente@tornillo.com',
    password: 'Clave1234', acceptTerms: true
};
const post = (path, body) => fetch(`${app.base}/api/public${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});

function useCaptcha({ success = true } = {}) {
    const seen = [];
    config.captchaProvider = 'turnstile';
    config.turnstileSecret = 'secreto-de-turnstile';
    captcha.__setFetch(async (url, opts) => {
        seen.push({ url, body: Object.fromEntries(new URLSearchParams(opts.body)) });
        return { json: async () => ({ success }) };
    });
    return seen;
}

describe('honeypot', () => {
    test('un campo "website" relleno recibe éxito falso y no llega a Java', async () => {
        javaCalls.length = 0;
        useCaptcha();
        const r = await post('/registrations', { ...FORM, website: 'http://spam.example', captchaToken: 'x' });
        assert.equal(r.status, 202);
        assert.ok((await r.json()).message);
        assert.equal(javaCalls.length, 0);
    });
});

describe('CAPTCHA', () => {
    test('si no lo supera: 400 y Java no se entera', async () => {
        javaCalls.length = 0;
        useCaptcha({ success: false });
        const r = await post('/registrations', { ...FORM, captchaToken: 'malo' });
        assert.equal(r.status, 400);
        assert.equal((await r.json()).code, 'CAPTCHA_FAILED');
        assert.equal(javaCalls.length, 0);
    });

    test('sin token no se consulta a Cloudflare y se rechaza', async () => {
        const seen = useCaptcha();
        const r = await post('/registrations', FORM);
        assert.equal(r.status, 400);
        assert.equal(seen.length, 0);
    });

    test('envía a Cloudflare el secreto, el token y la IP', async () => {
        const seen = useCaptcha();
        javaReply = { status: 202, body: { message: 'ok-java' } };
        await post('/registrations', { ...FORM, captchaToken: 'token-de-prueba' });
        assert.equal(seen.length, 1);
        assert.match(seen[0].url, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify$/);
        assert.equal(seen[0].body.secret, 'secreto-de-turnstile');
        assert.equal(seen[0].body.response, 'token-de-prueba');
        assert.ok(seen[0].body.remoteip);
    });

    test('producción sin CAPTCHA configurado: el registro se niega (falla cerrado)', async () => {
        config.captchaProvider = 'none';
        const prev = config.nodeEnv;
        config.nodeEnv = 'production';
        try {
            javaCalls.length = 0;
            const r = await post('/registrations', FORM);
            assert.equal(r.status, 503);
            assert.equal((await r.json()).code, 'REGISTRATION_UNAVAILABLE');
            assert.equal(javaCalls.length, 0);
        } finally {
            config.nodeEnv = prev;
        }
    });

    test('desarrollo sin CAPTCHA: se permite', async () => {
        config.captchaProvider = 'none';
        config.nodeEnv = 'development';
        javaReply = { status: 202, body: { message: 'ok-java' } };
        const r = await post('/registrations', FORM);
        assert.equal(r.status, 202);
    });
});

describe('reenvío a Java', () => {
    test('solo viajan los campos esperados (nada de roles, empresas ni campos extra)', async () => {
        useCaptcha();
        javaCalls.length = 0;
        javaReply = { status: 202, body: { message: 'ok-java' } };
        const r = await post('/registrations', {
            ...FORM, captchaToken: 'ok', website: '',
            role: 'PLATFORM_OWNER', organizationId: 1, status: 'ACTIVE', emailVerifiedAt: '2020-01-01'
        });
        assert.equal(r.status, 202);
        assert.equal(javaCalls.length, 1);
        assert.equal(javaCalls[0].url, '/public/registrations');
        assert.deepEqual(Object.keys(javaCalls[0].body).sort(),
            ['acceptTerms', 'adminEmail', 'companyName', 'password', 'taxId']);
    });

    test('los errores de Java (validación y conflicto) llegan al cliente sin cambios', async () => {
        useCaptcha();
        javaReply = { status: 409, body: { error: 'No pudimos completar el registro con esos datos.' } };
        const r = await post('/registrations', { ...FORM, captchaToken: 'ok' });
        assert.equal(r.status, 409);
        assert.match((await r.json()).error, /No pudimos completar/);

        javaReply = { status: 400, body: { error: 'El NIT es obligatorio' } };
        assert.equal((await post('/registrations', { ...FORM, captchaToken: 'ok' })).status, 400);
    });

    test('verify-email reenvía solo el token', async () => {
        javaCalls.length = 0;
        javaReply = { status: 200, body: { message: 'verificado' } };
        const r = await post('/verify-email', { token: 'abc', role: 'ADMIN' });
        assert.equal(r.status, 200);
        assert.deepEqual(javaCalls[0].body, { token: 'abc' });
    });

    test('resend-verification: honeypot, CAPTCHA y solo el correo', async () => {
        javaCalls.length = 0;
        useCaptcha();
        assert.equal((await post('/resend-verification', { email: 'a@b.com', website: 'x', captchaToken: 'ok' })).status, 202);
        assert.equal(javaCalls.length, 0);

        javaReply = { status: 202, body: { message: 'reenviado' } };
        await post('/resend-verification', { email: 'a@b.com', captchaToken: 'ok', admin: true });
        assert.deepEqual(javaCalls[0].body, { email: 'a@b.com' });
    });
});

describe('límite de frecuencia', () => {
    test('a partir del límite por IP se responde 429 y Java deja de recibir peticiones', async () => {
        useCaptcha();
        javaReply = { status: 202, body: { message: 'ok-java' } };
        const limited = await startApp('/api/public',
            require('../src/routes/public.routes').createPublicRouter({ registrationLimit: 3 }));
        try {
            javaCalls.length = 0;
            const statuses = [];
            for (let i = 0; i < 6; i++) {
                const r = await fetch(`${limited.base}/api/public/registrations`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...FORM, captchaToken: 'ok' })
                });
                statuses.push(r.status);
            }
            assert.deepEqual(statuses, [202, 202, 202, 429, 429, 429]);
            assert.equal(javaCalls.length, 3, 'las bloqueadas no llegan a Java');
        } finally {
            await limited.close();
        }
    });
});
