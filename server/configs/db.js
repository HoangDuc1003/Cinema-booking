import mongoose from 'mongoose'

let cached = global._mongooseConnection;

const connectDB = async () => {
    if (cached) return cached;

    try {
        const baseUri = process.env.MONGODB_URI;

        let finalUri = baseUri;

        cached = await mongoose.connect(finalUri, {
            tlsAllowInvalidCertificates: true, 
            serverSelectionTimeoutMS: 5000,    
            socketTimeoutMS: 45000,            
            family: 4  
        });
        
        global._mongooseConnection = cached;
        console.log(mongoose.connection.name);
        
        return cached;
    } catch (error) {
        console.error(error.message);
        throw error;
    }
}

export default connectDB;