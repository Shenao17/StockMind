/**
 * Pruebas de la aplicación completa del gateway (app.js): cabeceras de seguridad,
 * CORS, límites, errores, ID de correlación y registro estructurado.
 */
process.env.LOG_LEVEL = 'info';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.LANDING_URL = 'https://landing.stockmind.example';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const { tokenFor } = require('./helpers');
const { createApp, createLogger } = require('../app');

const logLines = [];
const sink = new Writable({
    write(chunk, _enc, cb) {
        chunk.toString().split('\n').filter(Boolean).forEach(l => logLines.push(JSON.parse(l)));
        cb();
    }
});

let server;
let base;

before(async () => {
    const app = createApp({ logger: createLogger(sink) });
    server = await new Promise(resolve => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise(r => server.close(r)));

describe('seguridad HTTP', () => {
    test('envía cabeceras de seguridad y no revela Express', async () => {
        const r = await fetch(`${base}/health`);
        assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
        assert.ok(r.headers.get('strict-transport-security'));
        assert.ok(r.headers.get('content-security-policy'));
        assert.equal(r.headers.get('x-powered-by'), null);
    });

    test('/health no expone direcciones internas de los servicios', async () => {
        const body = await (await fetch(`${base}/health`)).json();
        assert.equal(body.status, 'OK');
        const text = JSON.stringify(body);
        assert.ok(!text.includes('127.0.0.1') && !text.includes('upstreams'));
    });

    test('ruta inexistente → 404 JSON', async () => {
        const r = await fetch(`${base}/no-existe`);
        assert.equal(r.status, 404);
        assert.equal((await r.json()).error, 'Ruta no encontrada');
    });

    test('CORS: solo el origen del frontend, con credenciales', async () => {
        const ok = await fetch(`${base}/health`, { headers: { Origin: 'http://localhost:5173' } });
        assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
        assert.equal(ok.headers.get('access-control-allow-credentials'), 'true');

        // El middleware responde siempre con el origen configurado; el navegador bloquea
        // la lectura cuando no coincide con el origen de la página. Nunca se refleja el ajeno.
        const evil = await fetch(`${base}/health`, { headers: { Origin: 'http://evil.example' } });
        assert.notEqual(evil.headers.get('access-control-allow-origin'), 'http://evil.example');
        assert.notEqual(evil.headers.get('access-control-allow-origin'), '*');
    });
});

describe('CORS de la landing', () => {
    const preflight = (path, origin) => fetch(`${base}${path}`, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }
    });

    test('la landing puede llamar a /api/public, sin cookies', async () => {
        const r = await preflight('/api/public/registrations', 'https://landing.stockmind.example');
        assert.equal(r.headers.get('access-control-allow-origin'), 'https://landing.stockmind.example');
        assert.notEqual(r.headers.get('access-control-allow-credentials'), 'true');
    });

    test('la landing NO puede usar el resto de la API', async () => {
        const r = await preflight('/api/products', 'https://landing.stockmind.example');
        assert.notEqual(r.headers.get('access-control-allow-origin'), 'https://landing.stockmind.example');
    });

    test('un origen desconocido no recibe permiso en /api/public', async () => {
        const r = await preflight('/api/public/registrations', 'http://evil.example');
        assert.notEqual(r.headers.get('access-control-allow-origin'), 'http://evil.example');
    });
});

describe('límites y errores del cuerpo', () => {
    const post = (body, type = 'application/json') =>
        fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': type }, body });

    test('cuerpo mayor al límite → 413', async () => {
        const r = await post(JSON.stringify({ username: 'a', password: 'x'.repeat(200 * 1024) }));
        assert.equal(r.status, 413);
        assert.equal((await r.json()).code, 'PAYLOAD_TOO_LARGE');
    });

    test('JSON mal formado → 400 (no 500)', async () => {
        const r = await post('{esto no es json');
        assert.equal(r.status, 400);
        assert.equal((await r.json()).code, 'INVALID_JSON');
    });
});

describe('ID de correlación', () => {
    test('genera un X-Request-Id cuando no llega uno', async () => {
        const id = (await fetch(`${base}/health`)).headers.get('x-request-id');
        assert.match(id, /^[0-9a-f-]{36}$/);
    });

    test('reutiliza el que manda el proxy si es válido', async () => {
        const r = await fetch(`${base}/health`, { headers: { 'X-Request-Id': 'proxy-req-12345' } });
        assert.equal(r.headers.get('x-request-id'), 'proxy-req-12345');
    });

    test('descarta uno malicioso o demasiado corto', async () => {
        const r = await fetch(`${base}/health`, { headers: { 'X-Request-Id': 'x' } });
        assert.notEqual(r.headers.get('x-request-id'), 'x');
    });
});

describe('registro estructurado', () => {
    test('registra método, ruta, estado y duración; sin cookie, sin query y sin /health', async () => {
        logLines.length = 0;
        await fetch(`${base}/health`);
        await fetch(`${base}/api/products?search=consulta-privada`, {
            headers: { Cookie: 'token=VALOR-SECRETO-DE-LA-COOKIE' }
        });
        await new Promise(r => setTimeout(r, 50));

        const entries = logLines.filter(l => l.req);
        assert.equal(entries.some(l => l.req.path === '/health'), false, '/health no se registra');

        const line = entries.find(l => l.req.path === '/api/products');
        assert.ok(line, 'debe haber una línea para /api/products');
        assert.equal(line.req.method, 'GET');
        assert.equal(line.res.statusCode, 401);
        assert.equal(line.level, 40); // warn
        assert.equal(typeof line.responseTime, 'number');
        assert.equal(line.service, 'gateway');

        const raw = JSON.stringify(logLines);
        assert.ok(!raw.includes('VALOR-SECRETO-DE-LA-COOKIE'), 'la cookie no debe aparecer en los logs');
        assert.ok(!raw.includes('consulta-privada'), 'el query string no debe aparecer en los logs');
    });

    test('incluye el usuario autenticado', async () => {
        logLines.length = 0;
        await fetch(`${base}/api/users`, { headers: { Cookie: `token=${tokenFor('ADMIN')}` } });
        await new Promise(r => setTimeout(r, 50));
        const line = logLines.find(l => l.req?.path === '/api/users' && l.res); // línea de la petición
        assert.equal(line.userId, 1);
    });
});
