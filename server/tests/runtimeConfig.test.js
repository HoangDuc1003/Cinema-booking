import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getClientOrigin,
    getClerkConfigStatus,
    getConfiguredClientUrl,
    getPaymentConfigStatus,
    validateClerkConfig,
} from '../configs/runtimeConfig.js';

test('production requires CLIENT_URL', () => {
    assert.throws(
        () => getConfiguredClientUrl({ NODE_ENV: 'production' }),
        (error) => error.code === 'CLIENT_URL_MISSING' && error.statusCode === 503,
    );
});

test('CLIENT_URL is validated and normalized', () => {
    assert.equal(
        getConfiguredClientUrl({ NODE_ENV: 'production', CLIENT_URL: 'https://nitrocine.example.com/path/' }),
        'https://nitrocine.example.com',
    );
    assert.throws(
        () => getConfiguredClientUrl({ NODE_ENV: 'production', CLIENT_URL: 'not-a-url' }),
        /valid URL/,
    );
});

test('local origin falls back to request origin', () => {
    assert.equal(
        getClientOrigin({ headers: { origin: 'http://127.0.0.1:5173' } }, { NODE_ENV: 'development' }),
        'http://127.0.0.1:5173',
    );
});

test('payment health exposes presence only', () => {
    assert.deepEqual(
        getPaymentConfigStatus({ STRIPE_SECRET_KEY: 'secret', CLIENT_URL: 'https://example.com' }),
        { stripe: { configured: true }, clientUrl: { configured: true } },
    );
});

test('production Clerk configuration warns for test keys without exposing values', () => {
    assert.deepEqual(
        getClerkConfigStatus({ CLERK_PUBLISHABLE_KEY: 'pk_live_public', CLERK_SECRET_KEY: 'sk_live_secret' }),
        {
            publishableKey: { configured: true, live: true },
            secretKey: { configured: true, live: true },
        },
    );
    const validation = validateClerkConfig({
        NODE_ENV: 'production',
        CLERK_PUBLISHABLE_KEY: 'pk_test_public',
        CLERK_SECRET_KEY: 'sk_test_secret',
    });
    assert.equal(validation.warning, 'CLERK_LIVE_KEYS_RECOMMENDED');
});
