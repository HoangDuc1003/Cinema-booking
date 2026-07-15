import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
    createCorsMiddleware,
    getAllowedCorsOrigins,
    handleCorsError,
    PRODUCTION_CLIENT_ORIGIN,
} from '../middleware/corsPolicy.js';

const createProbeServer = async (env) => {
    const app = express();
    app.use(createCorsMiddleware(env));
    app.use(handleCorsError);
    app.all('/probe', (req, res) => res.status(200).json({ success: true }));

    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const address = server.address();

    return {
        url: `http://127.0.0.1:${address.port}/probe`,
        close: () => new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        }),
    };
};

test('normalizes CLIENT_URL and explicit origins into a strict allowlist', () => {
    const origins = getAllowedCorsOrigins({
        NODE_ENV: 'production',
        CLIENT_URL: 'https://nitrocine.vercel.app/',
        CORS_ALLOWED_ORIGINS: 'https://preview.example.com/path/, https://admin.example.com',
    });

    assert.deepEqual([...origins].sort(), [
        PRODUCTION_CLIENT_ORIGIN,
        'https://admin.example.com',
        'https://preview.example.com',
    ].sort());
    assert.equal(origins.has('*'), false);
    assert.equal(origins.has('http://localhost:5173'), false);
});

test('allows production GET with credentials and the exact origin header', async (t) => {
    const probe = await createProbeServer({ NODE_ENV: 'production' });
    t.after(probe.close);

    const response = await fetch(probe.url, {
        headers: { Origin: PRODUCTION_CLIENT_ORIGIN },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), PRODUCTION_CLIENT_ORIGIN);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    assert.notEqual(response.headers.get('access-control-allow-origin'), '*');
});

test('handles allowed Clerk authorization preflight before application routes', async (t) => {
    const probe = await createProbeServer({ NODE_ENV: 'production' });
    t.after(probe.close);

    const response = await fetch(probe.url, {
        method: 'OPTIONS',
        headers: {
            Origin: PRODUCTION_CLIENT_ORIGIN,
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'authorization,content-type',
        },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), PRODUCTION_CLIENT_ORIGIN);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    assert.match(response.headers.get('access-control-allow-headers') || '', /authorization/i);
    assert.match(response.headers.get('access-control-allow-headers') || '', /content-type/i);
});

test('allows the two explicit Vite origins only outside production', async (t) => {
    const probe = await createProbeServer({ NODE_ENV: 'development' });
    t.after(probe.close);

    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
        const response = await fetch(probe.url, { headers: { Origin: origin } });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('access-control-allow-origin'), origin);
    }
});

test('denies unlisted origins for both GET and OPTIONS without CORS headers', async (t) => {
    const probe = await createProbeServer({ NODE_ENV: 'production' });
    t.after(probe.close);

    for (const request of [
        { method: 'GET' },
        {
            method: 'OPTIONS',
            headers: {
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'authorization',
            },
        },
    ]) {
        const response = await fetch(probe.url, {
            ...request,
            headers: {
                Origin: 'https://attacker.example',
                ...request.headers,
            },
        });

        assert.equal(response.status, 403);
        assert.equal(response.headers.get('access-control-allow-origin'), null);
        assert.equal(response.headers.get('access-control-allow-credentials'), null);
        assert.match(response.headers.get('vary') || '', /origin/i);
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
});
