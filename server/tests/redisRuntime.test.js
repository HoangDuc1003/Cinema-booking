import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
            timeout: 5000,
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
