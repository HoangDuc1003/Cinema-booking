import assert from 'node:assert/strict';
import test from 'node:test';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler.js';

const fakeResponse = () => {
    const res = { statusCode: 200, body: null, headersSent: false };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
};

const quietly = (run) => {
    const original = console.error;
    const logged = [];
    console.error = (line) => logged.push(line);
    try {
        run();
    } finally {
        console.error = original;
    }
    return logged;
};

test('unknown routes get a JSON 404 instead of an HTML page', () => {
    const res = fakeResponse();
    notFoundHandler({ method: 'GET', originalUrl: '/api/nope' }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { success: false, code: 'NOT_FOUND', message: 'Route GET /api/nope does not exist.' });
});

test('an unexpected error hides its internal message but keeps the request ID', () => {
    const res = fakeResponse();
    const logged = quietly(() => errorHandler(
        new Error('connection string mongodb+srv://user:secret@host leaked'),
        { requestId: 'req-1', method: 'POST', path: '/api/booking/create' },
        res,
        () => {},
    ));
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.code, 'INTERNAL_ERROR');
    assert.equal(res.body.requestId, 'req-1');
    assert.doesNotMatch(res.body.message, /secret|mongodb/);
    // The detail still reaches the server log for debugging.
    assert.match(logged[0], /unhandled-request-error/);
});

test('client errors keep their status and message', () => {
    const res = fakeResponse();
    const malformedJson = Object.assign(new Error('Unexpected token } in JSON'), { status: 400, type: 'entity.parse.failed' });
    quietly(() => errorHandler(malformedJson, { requestId: 'req-2', method: 'POST', path: '/x' }, res, () => {}));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'INVALID_JSON');
    assert.match(res.body.message, /Unexpected token/);
});

test('nothing is written once a response has already started', () => {
    const res = fakeResponse();
    res.headersSent = true;
    quietly(() => errorHandler(new Error('late'), { method: 'GET', path: '/x' }, res, () => {}));
    assert.equal(res.body, null);
});
