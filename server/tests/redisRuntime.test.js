import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runWithCommandTimeout } from '../configs/redis.js';

test('Redis health fails fast when a configured endpoint is unreachable', () => {
    const script = `
        import { getRedisHealth } from './configs/redis.js';
        const startedAt = Date.now();
        const health = await getRedisHealth();
        console.log(JSON.stringify({ elapsedMs: Date.now() - startedAt, health }));
        process.exit(0);
    `;
    const result = spawnSync(
        process.execPath,
        ['--input-type=module', '--eval', script],
        {
            cwd: fileURLToPath(new URL('..', import.meta.url)),
            env: {
                ...process.env,
                REDIS_URL: 'redis://127.0.0.1:63999',
                REDIS_CONNECT_TIMEOUT_MS: '100',
                REDIS_MAX_RECONNECT_ATTEMPTS: '0',
                REDIS_COMMAND_TIMEOUT_MS: '100',
            },
            encoding: 'utf8',
            // Only a hang guard: fail-fast is asserted on elapsedMs below. Node's cold
            // start alone can exceed 5s while the full suite runs in parallel.
            timeout: 30_000,
        },
    );
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    const output = result.stdout
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .at(-1);
    const parsed = JSON.parse(output);
    assert.equal(parsed.health.configured, true);
    assert.equal(parsed.health.connected, false);
    assert.equal(parsed.health.status, 'unavailable');
    assert.ok(parsed.elapsedMs < 1000, `Redis health took ${parsed.elapsedMs}ms`);
});

test('optional public cache timeout does not change required command invalidation semantics', async () => {
    let destroyed = false;
    const client = { destroy: () => { destroyed = true; } };
    // The timeout timer is unref'd so it never holds a serverless process open.
    // Nothing else keeps this test's event loop alive, and on some Node versions
    // the runner would end the test before the timer fires.
    const keepAlive = setInterval(() => {}, 1000);
    try {
        await assert.rejects(
            runWithCommandTimeout(client, () => new Promise(() => {}), {
                timeoutMs: 20,
                invalidateOnTimeout: false,
            }),
            /Redis command timed out/,
        );
    } finally {
        clearInterval(keepAlive);
    }
    assert.equal(destroyed, false);
});
