/**
 * Pruebas de las rutas reales del gateway: verifican que cada endpoint
 * exige sesión y el rol correcto. La comprobación de rol ocurre ANTES de llamar
 * a Java/Python, así que no hace falta ningún servicio externo.
 * Cuando el rol sí es válido, la petición llega al handler y falla con 503
 * (upstream no disponible): eso demuestra que pasó la autorización.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { tokenFor, startApp, call } = require('./helpers');

// Rutas que solo puede usar ADMIN: [método, ruta]
const ADMIN_ONLY = {
    users:     ['/api/users', [['GET', '/'], ['POST', '/'], ['PUT', '/1'], ['DELETE', '/1']]],
    products:  ['/api/products', [['POST', '/'], ['PUT', '/1'], ['DELETE', '/1']]],
    inventory: ['/api/inventory', [['POST', '/movements']]],
    reports:   ['/api/reports', [['GET', '/sales'], ['GET', '/top-products']]],
};

// Rutas que cualquier usuario con sesión puede usar
const ANY_USER = {
    products:  ['/api/products', [['GET', '/'], ['GET', '/low-stock'], ['GET', '/1']]],
    inventory: ['/api/inventory', [['GET', '/movements']]],
    sales:     ['/api/sales', [['GET', '/'], ['GET', '/1'], ['POST', '/']]],
    dashboard: ['/api/dashboard', [['GET', '/summary']]],
    categories: ['/api/categories', [['GET', '/']]],
};

const servers = {};
const routerOf = name => require(`../src/routes/${name}.routes`);

before(async () => {
    const names = new Set([...Object.keys(ADMIN_ONLY), ...Object.keys(ANY_USER)]);
    for (const name of names) {
        const mount = (ADMIN_ONLY[name] || ANY_USER[name])[0];
        servers[name] = await startApp(mount, routerOf(name));
    }
});

after(async () => {
    await Promise.all(Object.values(servers).map(s => s.close()));
});

describe('rutas solo ADMIN', () => {
    for (const [name, [mount, routes]] of Object.entries(ADMIN_ONLY)) {
        for (const [method, path] of routes) {
            const full = mount + (path === '/' ? '' : path);

            test(`${method} ${full}: sin sesión → 401`, async () => {
                const r = await call(servers[name].base, method, full, null);
                assert.equal(r.status, 401);
            });

            test(`${method} ${full}: SELLER → 403`, async () => {
                const r = await call(servers[name].base, method, full, tokenFor('SELLER'));
                assert.equal(r.status, 403);
            });

            test(`${method} ${full}: ADMIN pasa la autorización`, async () => {
                const r = await call(servers[name].base, method, full, tokenFor('ADMIN'));
                assert.ok(![401, 403].includes(r.status), `esperaba pasar la autorización, got ${r.status}`);
            });
        }
    }
});

describe('rutas para cualquier usuario autenticado', () => {
    for (const [name, [mount, routes]] of Object.entries(ANY_USER)) {
        for (const [method, path] of routes) {
            const full = mount + (path === '/' ? '' : path);

            test(`${method} ${full}: sin sesión → 401`, async () => {
                const r = await call(servers[name].base, method, full, null);
                assert.equal(r.status, 401);
            });

            test(`${method} ${full}: SELLER pasa la autorización`, async () => {
                const r = await call(servers[name].base, method, full, tokenFor('SELLER'));
                assert.ok(![401, 403].includes(r.status), `esperaba pasar la autorización, got ${r.status}`);
            });
        }
    }
});

test('rutas de predicciones y agente exigen sesión', async () => {
    for (const [name, mount, path] of [
        ['predictions', '/api/predictions', '/recommendations'],
        ['agent', '/api/agent', '/status'],
    ]) {
        const s = await startApp(mount, routerOf(name));
        try {
            const r = await call(s.base, 'GET', mount + path, null);
            assert.equal(r.status, 401, `${mount}${path} debería exigir sesión`);
        } finally {
            await s.close();
        }
    }
});
