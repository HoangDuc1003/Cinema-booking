import { randomUUID } from 'node:crypto';
import { connectRedis } from '../configs/redis.js';

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
`;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class LockBusyError extends Error {
    constructor(message = 'Resource is busy. Please retry.') {
        super(message);
        this.name = 'LockBusyError';
        this.statusCode = 409;
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
