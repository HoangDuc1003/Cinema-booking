import mongoose from 'mongoose';
import ensureCriticalIndexes from './indexes.js';

// Vercel serverless: reuse connection across warm invocations.
const runtimeGlobal = globalThis;
let cached = runtimeGlobal._mongooseConnection;
if (!cached) {
    cached = runtimeGlobal._mongooseConnection = { conn: null, promise: null };
}

const safeDatabaseError = (error, fallback = 'DATABASE_UNAVAILABLE') => {
    const safe = new Error(fallback);
    safe.name = 'DatabaseUnavailableError';
    safe.code = fallback;
    safe.statusCode = 503;
    safe.cause = error;
    return safe;
};

const connectDB = async ({ ensureIndexes = true, timing } = {}) => {
    const connectStartedAt = performance.now();
    const connectionState = cached.conn || cached.promise ? 'warm' : 'cold';
    let connection;

    // Return existing connection immediately, but keep index readiness separate.
    if (cached.conn) {
        connection = cached.conn;
    } else if (cached.promise) {
        connection = await cached.promise;
        cached.conn = connection;
    }

    if (!connection) {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            throw safeDatabaseError(new Error('MONGODB_URI is missing'), 'INVALID_CONFIGURATION');
        }

        console.log('[DB] Connecting to MongoDB...');

        cached.promise = mongoose.connect(uri, {
            serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || 5000,
            socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS) || 15000,
            maxPoolSize: 10,
            family: 4,
        }).then((m) => {
            console.log('[DB] MongoDB Connected ✔');
            return m;
        }).catch((err) => {
            // Reset cache so next invocation retries
            cached.promise = null;
            console.error(JSON.stringify({
                event: 'database-connection-failed',
                errorCode: err?.code || err?.name || 'DATABASE_UNAVAILABLE',
            }));
            throw safeDatabaseError(err);
        });

        connection = await cached.promise;
        cached.conn = connection;
        cached.promise = null;
    }

    if (timing) {
        timing.dbConnectMs = performance.now() - connectStartedAt;
        timing.dbConnectionState = connectionState;
    }
    if (ensureIndexes) {
        const indexStartedAt = performance.now();
        try {
            await ensureCriticalIndexes();
        } catch (error) {
            const safe = safeDatabaseError(error, 'DATABASE_INDEX_UNAVAILABLE');
            safe.statusCode = 503;
            throw safe;
        }
        if (timing) timing.indexVerificationMs = performance.now() - indexStartedAt;
    } else if (timing) {
        timing.indexVerificationMs = 0;
    }
    return connection;
};

export default connectDB;
