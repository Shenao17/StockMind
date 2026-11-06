const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const CONFIG = path.join(__dirname, '..', 'src', 'config', 'config.js');

// Se ejecuta en un proceso aparte para controlar el entorno desde cero
const load = env => execFileSync(process.execPath, ['-e', `
    try { const c = require(${JSON.stringify(CONFIG)}); console.log(JSON.stringify({ ok: true, agent: c.agentEnabled })); }
    catch (e) { console.log(JSON.stringify({ ok: false, msg: e.message })); }
`], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' }).trim();

test('sin JWT_SECRET el gateway no arranca', () => {
    const r = JSON.parse(load({}));
    assert.equal(r.ok, false);
    assert.match(r.msg, /JWT_SECRET/);
});

test('sin INTERNAL_API_KEY (o demasiado corta) el gateway no arranca', () => {
    const missing = JSON.parse(load({ JWT_SECRET: 'x'.repeat(40) }));
    assert.equal(missing.ok, false);
    assert.match(missing.msg, /INTERNAL_API_KEY/);
    assert.equal(JSON.parse(load({ JWT_SECRET: 'x'.repeat(40), INTERNAL_API_KEY: 'corta' })).ok, false);
});

test('JWT_SECRET demasiado corto se rechaza', () => {
    assert.equal(JSON.parse(load({ JWT_SECRET: 'corto' })).ok, false);
});

test('con un secreto válido arranca y el agente IA queda apagado por defecto', () => {
    const r = JSON.parse(load({ JWT_SECRET: 'x'.repeat(40), INTERNAL_API_KEY: 'y'.repeat(40) }));
    assert.equal(r.ok, true);
    assert.equal(r.agent, false);
});

test('AGENT_ENABLED=true enciende el agente', () => {
    const r = JSON.parse(load({ JWT_SECRET: 'x'.repeat(40), INTERNAL_API_KEY: 'y'.repeat(40), AGENT_ENABLED: 'true' }));
    assert.equal(r.agent, true);
});

test('authHeader reconstruye el Bearer desde la cookie', () => {
    const { authHeader } = require('../src/utils/authHeader');
    assert.deepEqual(authHeader({ cookies: { token: 'abc' } }), { Authorization: 'Bearer abc' });
});
