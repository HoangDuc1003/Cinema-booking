import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import connectDB from './configs/db.js';
import { clerkMiddleware } from '@clerk/express'
import { inngest, functions } from './inngest/index.js';
import { serve } from 'inngest/express'
import showRouter from './routes/showRoutes.js';
import bookingRouter from './routes/bookingRoutes.js';
import adminRouter from './routes/adminRoutes.js';
import userRouter from './routes/userRoutes.js';

// Handle process-level errors
process.on('unhandledRejection', (reason) => {
    console.error('\x1b[31m[Unhandled Rejection]\x1b[0m', reason);
});

process.on('uncaughtException', (error) => {
    console.error('\x1b[31m[Uncaught Exception]\x1b[0m', error);
    process.exit(1);
});

// Core middleware
const app = express();
const port = process.env.PORT || 3000;

// Core middleware
app.use(express.json())
app.use(cors())
app.use(clerkMiddleware())

// API routes
app.get('/', (req, res) => res.send('Server is live!'))
app.use('/api/inngest', serve({ client: inngest, functions }));
app.use('/api/show', showRouter)
app.use('/api/booking', bookingRouter)
app.use('/api/admin', adminRouter)
app.use('/api/user', userRouter)

// Start server
const startServer = async () => {
    try {
        await connectDB();
    } catch (error) {
        console.error('\x1b[31m[Critical] Database connection failed at startup:\x1b[0m', error.message);
        console.error('\x1b[33m[Tip] The server is still starting, but API calls requiring a database will fail.\x1b[0m');
        console.error('\x1b[33m[Tip] Check your internet connection or try using a different DNS (e.g., 8.8.8.8).\x1b[0m');
    }

    app.listen(port, () => {
        console.log(`\x1b[32m✔ Server is running on port ${port}\x1b[0m`);
        console.log(`\x1b[36m➜ Local:   http://127.0.0.1:${port}\x1b[0m`);
    });
};

startServer();

export default app;