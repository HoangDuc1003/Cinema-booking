import { connectRedis, runWithCommandTimeout } from '../configs/redis.js';

const withRedis = async (operation, fallback = null, options = {}) => {
    try {
        const client = await connectRedis({ timeoutMs: options.timeoutMs });
        if (!client?.isReady) return fallback;
        return await runWithCommandTimeout(client, operation, {
            timeoutMs: options.timeoutMs,
            invalidateOnTimeout: options.invalidateOnTimeout ?? true,
        });
    } catch (error) {
        console.warn('[Redis cache] Bypassed:', error.message);
        return fallback;
    }
};

export const withRequiredRedis = async (operation) => {
    const client = await connectRedis({ required: true });
    if (!client?.isReady) throw new Error('Redis is not ready');
    return runWithCommandTimeout(client, operation);
};

export const getJson = async (key, options = {}) => withRedis(async (client) => {
    const value = await client.get(key);
    return value === null ? null : JSON.parse(value);
}, null, options);

export const setJson = async (key, value, ttlSeconds, options = {}) => withRedis(
    (client) => client.set(key, JSON.stringify(value), { EX: ttlSeconds }),
    false,
    options,
);

export const setRequiredJson = async (key, value, ttlSeconds) => withRequiredRedis(
    (client) => client.set(key, JSON.stringify(value), { EX: ttlSeconds }),
);

export const getValue = async (key) => withRedis((client) => client.get(key));

export const setValue = async (key, value, ttlSeconds) => withRedis(
    (client) => client.set(key, value, { EX: ttlSeconds }),
    false,
);

export const deleteKeys = async (...keys) => {
    const filtered = keys.flat().filter(Boolean);
    if (!filtered.length) return 0;
    return withRedis((client) => client.del(filtered), 0);
};

export const deleteByPattern = async (pattern) => withRedis(async (client) => {
    let deleted = 0;
    for await (const entry of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        const keys = Array.isArray(entry) ? entry : [entry];
        if (keys.length) deleted += await client.del(keys);
    }
    return deleted;
}, 0);

export const rememberJson = async (key, ttlSeconds, loader) => {
    const cached = await getJson(key);
    if (cached !== null) return { value: cached, cache: 'hit' };

    const value = await loader();
    await setJson(key, value, ttlSeconds);
    return { value, cache: 'miss' };
};

export default {
    getJson,
    setJson,
    getValue,
    setValue,
    deleteKeys,
    deleteByPattern,
    rememberJson,
    withRequiredRedis,
    setRequiredJson,
};
