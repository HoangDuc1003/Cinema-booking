import test from 'node:test';
import assert from 'node:assert/strict';
import {
    acquireFencedLock,
    releaseFencedLock,
    renewFencedLock,
    verifyFencedLock,
} from '../services/lockService.js';

test('fenced catalog lease increments tokens and rejects stale owners', async () => {
    const originalUrl = process.env.REDIS_URL;
    const state = globalThis.__nitroCineRedisState;
    const originalClient = state.client;
    const values = new Map();
    let fence = 0;
    const client = {
        isReady: true,
        isOpen: true,
        eval: async (script, options) => {
            const key = options.keys[0];
            if (script.includes("redis.call('INCR'")) {
                if (values.has(key)) return null;
                fence = Math.max(fence, Number(options.arguments[2]) || 0);
                fence += 1;
                const value = `${options.arguments[0]}:${fence}`;
                values.set(key, value);
                return [String(fence), value];
            }
            if (script.includes('PEXPIRE')) return values.get(key) === options.arguments[0] ? 1 : 0;
            if (values.get(key) === options.arguments[0]) {
                values.delete(key);
                return 1;
            }
            return 0;
        },
        get: async (key) => key === 'catalog-fence' ? String(fence) : (values.get(key) || null),
    };
    process.env.REDIS_URL = 'redis://test';
    state.client = client;
    try {
        const first = await acquireFencedLock('catalog-lock', 'catalog-fence', { ttlMs: 1000 });
        assert.equal(first.fencingToken, 1);
        assert.equal(await verifyFencedLock(first), true);
        assert.equal(await renewFencedLock(first), true);
        await releaseFencedLock(first);
        const second = await acquireFencedLock('catalog-lock', 'catalog-fence', { ttlMs: 1000 });
        assert.equal(second.fencingToken, 2);
        assert.equal(await verifyFencedLock(first), false);
        await releaseFencedLock(second);
        const recovered = await acquireFencedLock('catalog-lock', 'catalog-fence', { ttlMs: 1000, minimumFencingToken: 10 });
        assert.equal(recovered.fencingToken, 11);
        await releaseFencedLock(recovered);
    } finally {
        state.client = originalClient;
        if (originalUrl === undefined) delete process.env.REDIS_URL;
        else process.env.REDIS_URL = originalUrl;
    }
});
