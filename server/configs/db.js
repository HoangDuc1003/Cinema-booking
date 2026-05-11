import mongoose from 'mongoose'

// Cache the connection to avoid reconnecting on every serverless invocation
let cached = global._mongooseConnection;

const connectDB = async () => {
    if (cached) return cached;

    try {
        mongoose.connection.on('connected', () => console.log('Database connected'));
        mongoose.connection.on('error', (err) => console.error('Mongoose connection error:', err));

        cached = await mongoose.connect(`${process.env.MONGODB_URI}/nitrocine`);
        global._mongooseConnection = cached;

        return cached;
    } catch (error) {
        console.error('Database connection failed:', error.message);
        throw error;
    }
}

export default connectDB;