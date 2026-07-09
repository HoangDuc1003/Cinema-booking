import mongoose from 'mongoose';

// Vercel serverless: reuse connection across warm invocations
let cached = global._mongooseConnection;
if (!cached) {
    cached = global._mongooseConnection = { conn: null, promise: null };
}

const connectDB = async () => {
    // Return existing connection immediately
    if (cached.conn) {
        return cached.conn;
    }

    // If a connection attempt is in progress, wait for it
    if (cached.promise) {
        cached.conn = await cached.promise;
        return cached.conn;
    }

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI environment variable is not set');
    }

    console.log('[DB] Connecting to MongoDB...');

    cached.promise = mongoose.connect(uri, {
        serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || 5000,
        socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS) || 15000,
        maxPoolSize: 10,
        family: 4
    }).then((m) => {
        console.log('[DB] MongoDB Connected ✔');
        return m;
    }).catch((err) => {
        // Reset cache so next invocation retries
        cached.promise = null;
        console.error('[DB] MongoDB Connection Failed:', err.message);
        throw err;
    });

    cached.conn = await cached.promise;
    return cached.conn;
}

export default connectDB;
