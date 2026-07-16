import { randomUUID } from 'node:crypto';
import { connectRedis } from '../configs/redis.js';

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
`;

const ACQUIRE_FENCED_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then
    local current = tonumber(redis.call('GET', KEYS[2]) or '0')
    local minimum = tonumber(ARGV[3] or '0')
    if current < minimum then redis.call('SET', KEYS[2], tostring(minimum)) end
    local fence = redis.call('INCR', KEYS[2])
    local value = ARGV[1] .. ':' .. tostring(fence)
    redis.call('SET', KEYS[1], value, 'PX', ARGV[2], 'NX')
    return { tostring(fence), value }
end
return nil
`;

const RENEW_FENCED_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class LockBusyError extends Error {
    constructor(message = 'Resource is busy. Please retry.') {
        super(message);
        this.name = 'LockBusyError';
        this.statusCode = 409;
        this.code = 'LOCK_BUSY';
        this.transient = true;
    }
}

export const releaseLock = async ({ client, key, token }) => {
    if (!client?.isReady) return false;
    try {
        return await client.eval(RELEASE_SCRIPT, {
            keys: [key],
            arguments: [token],
        });
    } catch (error) {
        console.warn('[Redis lock] Release failed:', error.message);
        return false;
    }
};

export const acquireLock = async (key, {
    ttlMs,
    waitMs = 0,
    retryMs = 50,
} = {}) => {
    let client;
    try {
        client = await connectRedis();
    } catch (error) {
        console.warn('[Redis lock] Unavailable, using database invariant:', error.message);
        return { available: false, acquired: false };
    }

    if (!client?.isReady) return { available: false, acquired: false };

    const token = randomUUID();
    const deadline = Date.now() + waitMs;
    do {
        const result = await client.set(key, token, { NX: true, PX: ttlMs });
        if (result === 'OK') return { available: true, acquired: true, client, key, token };
        if (Date.now() >= deadline) break;
        await sleep(retryMs);
    } while (true);

    return { available: true, acquired: false };
};

export const withDistributedLock = async (key, options, task) => {
    const lock = await acquireLock(key, options);
    if (lock.available && !lock.acquired) throw new LockBusyError();

    try {
        return await task({ coordinatedByRedis: lock.acquired });
    } finally {
        if (lock.acquired) await releaseLock(lock);
    }
};

export const acquireFencedLock = async (key, fenceKey, {
    ttlMs = 120000,
    waitMs = 0,
    retryMs = 100,
    minimumFencingToken = 0,
} = {}) => {
    const client = await connectRedis({ required: true });
    if (!client?.isReady) throw new Error('Redis is required for catalog refresh locking');

    const ownerId = randomUUID();
    const deadline = Date.now() + waitMs;
    do {
        const result = await client.eval(ACQUIRE_FENCED_SCRIPT, {
            keys: [key, fenceKey],
            arguments: [ownerId, String(ttlMs), String(Math.max(0, Number(minimumFencingToken) || 0))],
        });
        if (Array.isArray(result) && result.length === 2) {
            return {
                acquired: true,
                client,
                key,
                fenceKey,
                ownerId,
                fencingToken: Number(result[0]),
                value: String(result[1]),
                ttlMs,
            };
        }
        if (Date.now() >= deadline) break;
        await sleep(retryMs);
    } while (true);

    throw new LockBusyError('Catalog refresh is already running.');
};

export const renewFencedLock = async (lock) => {
    if (!lock?.client?.isReady) return false;
    const result = await lock.client.eval(RENEW_FENCED_SCRIPT, {
        keys: [lock.key],
        arguments: [lock.value, String(lock.ttlMs)],
    });
    return Number(result) === 1;
};

export const verifyFencedLock = async (lock) => {
    if (!lock?.client?.isReady) return false;
    const [value, fence] = await Promise.all([
        lock.client.get(lock.key),
        lock.client.get(lock.fenceKey),
    ]);
    return value === lock.value && Number(fence) === lock.fencingToken;
};

export const releaseFencedLock = async (lock) => releaseLock({
    client: lock.client,
    key: lock.key,
    token: lock.value,
});
