import mongoose from 'mongoose';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

let cached = global._mongooseConnection;

const connectDB = async () => {
    if (cached) return cached;

    try {
        const baseUri = process.env.MONGODB_URI;

        let finalUri = baseUri;

        cached = await mongoose.connect(finalUri, {
            tlsAllowInvalidCertificates: true, 
            serverSelectionTimeoutMS: 15000,   
            socketTimeoutMS: 45000,            
            bufferTimeoutMS: 20000,            
            family: 4  
        });
        
        global._mongooseConnection = cached;
        console.log("MongoDB Connected");

        return cached;
    } catch (error) {
        console.error(error.message);
        throw error;
    }
}

export default connectDB;