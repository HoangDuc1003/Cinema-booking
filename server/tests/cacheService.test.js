import assert from 'node:assert/strict';
import test from 'node:test';
import { rememberJson } from '../services/cacheService.js';

// These run without a REDIS_URL, so every read misses and every write is a no-op.
// That is exactly the worst case the coalescing guard exists for.

test('concurrent misses for one key run the loader once and share its value', async () => {
    let calls = 0;
    const loader = async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 25));
        return { value: 'loaded' };
    };

    const results = await Promise.all(
        Array.from({ length: 5 }, () => rememberJson('test:coalesce:hit', 10, loader)),
    );

    assert.equal(calls, 1);
    for (const result of results) {
        assert.equal(result.cache, 'miss');
        assert.deepEqual(result.value, { value: 'loaded' });
    }
});

test('a failing loader rejects every waiter and leaves the key loadable again', async () => {
    let calls = 0;
    const failing = async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw Object.assign(new Error('upstream down'), { code: 'UPSTREAM_UNAVAILABLE' });
    };

    const settled = await Promise.allSettled(
        Array.from({ length: 3 }, () => rememberJson('test:coalesce:error', 10, failing)),
    );

    assert.equal(calls, 1);
    assert.ok(settled.every((entry) => entry.status === 'rejected'));
    assert.equal(settled[0].reason.code, 'UPSTREAM_UNAVAILABLE');

    const recovered = await rememberJson('test:coalesce:error', 10, async () => ({ value: 'recovered' }));
    assert.deepEqual(recovered.value, { value: 'recovered' });
});

test('different keys are loaded independently', async () => {
    const seen = [];
    const load = (name) => async () => {
        seen.push(name);
        return { name };
    };

    const [first, second] = await Promise.all([
        rememberJson('test:coalesce:a', 10, load('a')),
        rememberJson('test:coalesce:b', 10, load('b')),
    ]);

    assert.deepEqual(seen.sort(), ['a', 'b']);
    assert.equal(first.value.name, 'a');
    assert.equal(second.value.name, 'b');
});
