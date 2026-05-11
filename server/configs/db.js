import mongoose from 'mongoose'

// Cache the connection to avoid reconnecting on every serverless invocation
let cached = global._mongooseConnection;

const connectDB = async () => {
    if (cached) return cached;

    try {
        // Parse URI to inject database name safely before query parameters
        let finalUri = process.env.MONGODB_URI;
        if (finalUri.includes('?')) {
            // Check if there is already a slash before the question mark
            if (finalUri.includes('/?')) {
                finalUri = finalUri.replace('/?', '/nitrocine?');
            } else {
                finalUri = finalUri.replace('?', '/nitrocine?');
            }
        } else {
            finalUri = finalUri.replace(/\/$/, '') + '/nitrocine';
        }

        cached = await mongoose.connect(finalUri, {
            tlsAllowInvalidCertificates: true,
            serverSelectionTimeoutMS: 5000,
        });
        global._mongooseConnection = cached;

        return cached;
    } catch (error) {
        console.error('Database connection failed:', error.message);
        throw error;
    }
}

export default connectDB;