import { createClient } from 'redis';

const state = globalThis.__nitroCineRedisState || {
    client: null,
    connectPromise: null,
    lastError: null,
};

globalThis.__nitroCineRedisState = state;

const createRedisClient = () => {
    const url = process.env.REDIS_URL;
    if (!url) return null;

    const client = createClient({
        url,
        socket: {
            connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS) || 5000,
            reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
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

export const connectRedis = async ({ required = false } = {}) => {
    if (!process.env.REDIS_URL) {
        if (required) throw new Error('REDIS_URL environment variable is not set');
        return null;
    }

    if (state.client?.isReady) return state.client;
    if (state.connectPromise) return state.connectPromise;

    if (!state.client || !state.client.isOpen) {
        state.client = createRedisClient();
    }

    if (state.client.isOpen) return state.client;

    state.connectPromise = state.client.connect()
        .then(() => state.client)
        .catch((error) => {
            state.lastError = error;
            if (!state.client?.isOpen) state.client = null;
            throw error;
        })
        .finally(() => {
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
        await client.ping();
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
