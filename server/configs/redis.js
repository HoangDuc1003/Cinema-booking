import { createClient } from 'redis';

const state = globalThis.__nitroCineRedisState || {
    client: null,
    connectPromise: null,
    lastError: null,
};

globalThis.__nitroCineRedisState = state;

const getMaxReconnectAttempts = () => {
    const configured = Number(process.env.REDIS_MAX_RECONNECT_ATTEMPTS);
    return Number.isInteger(configured) && configured >= 0 && configured <= 20
        ? configured
        : 1;
};

const getCommandTimeoutMs = () => {
    const configured = Number(process.env.REDIS_COMMAND_TIMEOUT_MS);
    return Number.isFinite(configured) && configured >= 100 && configured <= 30000
        ? configured
        : 2000;
};

const getConnectTimeoutMs = () => {
    const configured = Number(process.env.REDIS_CONNECT_TIMEOUT_MS);
    return Number.isFinite(configured) && configured >= 100 && configured <= 30000
        ? configured
        : 5000;
};

export const getPublicCacheTimeoutMs = () => {
    const configured = Number(process.env.REDIS_PUBLIC_CACHE_TIMEOUT_MS);
    return Number.isFinite(configured) && configured >= 500 && configured <= 1000
        ? configured
        : 750;
};

const invalidateClient = (client) => {
    if (state.client === client) state.client = null;
    try {
        client.destroy();
    } catch {
        // The client may already have closed while the command timed out.
    }
};

export const runWithCommandTimeout = async (client, operation, {
    timeoutMs = getCommandTimeoutMs(),
    invalidateOnTimeout = true,
} = {}) => {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            if (invalidateOnTimeout) invalidateClient(client);
            reject(new Error('Redis command timed out'));
        }, timeoutMs);
        timeoutId.unref?.();
    });
    try {
        return await Promise.race([operation(client), timeout]);
    } finally {
        clearTimeout(timeoutId);
    }
};

const createRedisClient = () => {
    const url = process.env.REDIS_URL;
    if (!url) return null;

    const client = createClient({
        url,
        socket: {
            connectTimeout: getConnectTimeoutMs(),
            reconnectStrategy: (retries) => {
                if (retries >= getMaxReconnectAttempts()) {
                    return new Error('Redis reconnect attempt limit reached');
                }
                return Math.min((retries + 1) * 100, 3000);
            },
        },
    });

    client.on('error', (error) => {
        state.lastError = error;
        console.error('[Redis] Client error:', error.message);
    });

    client.on('ready', () => {
        state.lastError = null;
        console.log('[Redis] Ready');
    });

    return client;
};

export const connectRedis = async ({ required = false, timeoutMs } = {}) => {
    if (!process.env.REDIS_URL) {
        if (required) throw new Error('REDIS_URL environment variable is not set');
        return null;
    }

    if (state.client?.isReady) return state.client;
    if (state.connectPromise) {
        if (!Number.isFinite(timeoutMs)) return state.connectPromise;
        let timeoutId;
        const timeout = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Redis connection timed out')), timeoutMs);
            timeoutId.unref?.();
        });
        return Promise.race([state.connectPromise, timeout]).finally(() => clearTimeout(timeoutId));
    }

    if (!state.client || !state.client.isOpen) {
        state.client = createRedisClient();
    }

    if (state.client.isOpen) return state.client;

    const client = state.client;
    const connectTimeoutMs = Number.isFinite(timeoutMs) ? timeoutMs : getConnectTimeoutMs();
    let timedOut = false;
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            timedOut = true;
            if (state.client === client) state.client = null;
            try {
                client.destroy();
            } catch {
                // The client may already have closed while the timeout fired.
            }
            reject(new Error('Redis connection timed out'));
        }, connectTimeoutMs);
        timeoutId.unref?.();
    });
    let connectionAttempt;
    try {
        connectionAttempt = client.connect();
    } catch (error) {
        connectionAttempt = Promise.reject(error);
    }
    connectionAttempt.then(
        () => {
            if (timedOut || state.client !== client) {
                invalidateClient(client);
            }
        },
        () => {},
    );
    state.connectPromise = Promise.race([connectionAttempt, timeout])
        .then(() => state.client)
        .catch((error) => {
            state.lastError = error;
            if (!state.client?.isOpen) state.client = null;
            throw error;
        })
        .finally(() => {
            clearTimeout(timeoutId);
            state.connectPromise = null;
        });

    return state.connectPromise;
};

export const getRedisClient = () => state.client;
export const isRedisReady = () => Boolean(state.client?.isReady);

export const getRedisHealth = async () => {
    const configured = Boolean(process.env.REDIS_URL);
    if (!configured) {
        return { configured: false, connected: false, status: 'disabled' };
    }

    try {
        const client = await connectRedis({ required: true });
        const startedAt = performance.now();
        await runWithCommandTimeout(client, (redisClient) => redisClient.ping());
        return {
            configured: true,
            connected: true,
            status: 'ready',
            latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
        };
    } catch (error) {
        return {
            configured: true,
            connected: false,
            status: 'unavailable',
        };
    }
};

export default connectRedis;
