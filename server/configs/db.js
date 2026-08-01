import mongoose from 'mongoose';
import ensureCriticalIndexes from './indexes.js';

// Vercel serverless: reuse connection across warm invocations
let cached = global._mongooseConnection;
if (!cached) {
    cached = global._mongooseConnection = { conn: null, promise: null };
}

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
            throw new Error('MONGODB_URI environment variable is not set');
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
            console.error('[DB] MongoDB Connection Failed:', err.message);
            throw err;
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
        await ensureCriticalIndexes();
        if (timing) timing.indexVerificationMs = performance.now() - indexStartedAt;
    } else if (timing) {
        timing.indexVerificationMs = 0;
    }
    return connection;
};

export default connectDB;
