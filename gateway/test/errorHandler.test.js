const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const errorHandler = require('../src/middleware/errorHandler.middleware');

function run(err) {
    const logged = [];
    const req = { log: { error: (...a) => logged.push(a), warn: () => {}, info: () => {} } };
    let status, body;
    const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
    errorHandler(err, req, res, () => {});
    return { status, body, logged };
}

describe('errorHandler', () => {
    test('upstream caído → 503 sin detalles internos', () => {
        const r = run(Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:8080'), {
            code: 'ECONNREFUSED', config: { url: 'http://backend:8080/products' }
        }));
        assert.equal(r.status, 503);
        assert.equal(r.body.code, 'SERVICE_UNAVAILABLE');
        assert.ok(!JSON.stringify(r.body).includes('10.0.0.5'));
    });

    test('timeout de axios → 504', () => {
        assert.equal(run(Object.assign(new Error('t'), { code: 'ECONNABORTED' })).status, 504);
    });

    test('timeout de fetch (AbortSignal.timeout) → 504', () => {
        const e = new Error('The operation was aborted'); e.name = 'TimeoutError';
        assert.equal(run(e).status, 504);
    });

    test('respuesta de error del upstream se reenvía con su estado', () => {
        const r = run({ response: { status: 400, data: { error: 'Stock insuficiente' } } });
        assert.equal(r.status, 400);
        assert.deepEqual(r.body, { error: 'Stock insuficiente' });
    });

    test('un 5xx del upstream queda registrado en el log', () => {
        const r = run({ response: { status: 500, data: { error: 'x' } }, config: { url: 'http://backend:8080/x' } });
        assert.equal(r.logged.length, 1);
    });

    test('error desconocido → 500 genérico, sin el mensaje original; el detalle va al log', () => {
        const r = run(new Error('SELECT * FROM users WHERE password = ...'));
        assert.equal(r.status, 500);
        assert.equal(r.body.code, 'INTERNAL_ERROR');
        assert.ok(!JSON.stringify(r.body).includes('SELECT'));
        assert.equal(r.logged.length, 1);
    });

    test('NODE_ENV=development ya no filtra el mensaje de error', () => {
        const prev = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';
        try {
            const r = run(new Error('detalle-interno'));
            assert.ok(!JSON.stringify(r.body).includes('detalle-interno'));
        } finally {
            process.env.NODE_ENV = prev;
        }
    });
});
