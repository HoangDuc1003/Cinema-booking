import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import connectDB from '../configs/db.js';
import { clerkMiddleware } from '@clerk/express'
import showRouter from '../routes/showRoutes.js';
import bookingRouter from '../routes/bookingRoutes.js';
import adminRouter from '../routes/adminRoutes.js';
import userRouter from '../routes/userRoutes.js';
import { stripeWebhooks } from '../controllers/stripeWebhooks.js';

// Error handlers
process.on('unhandledRejection', (reason) => {
    console.error('\x1b[31m[Unhandled Rejection]\x1b[0m', reason);
});
process.on('uncaughtException', (error) => {
    console.error('\x1b[31m[Uncaught Exception]\x1b[0m', error);
    // Don't exit on Vercel — let the function complete
    if (!process.env.VERCEL) process.exit(1);
});

const app = express();

// Stripe webhook must use raw body (before express.json)
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhooks);

// Middleware
app.use(express.json())
app.use(cors({
    origin: true,
    credentials: true
}))

// Clerk middleware — pass secretKey explicitly for Vercel compatibility
app.use(clerkMiddleware({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
}))

// Ensure DB is connected before handling any API route
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        console.error('[DB Middleware] Connection failed:', error.message);
        res.status(503).json({ success: false, message: 'Database temporarily unavailable. Please retry.' });
    }
});

// Routes
app.get('/', (req, res) => res.send('Server is live!'))

// Inngest route — only mount if Inngest is properly initialized
const mountInngest = async () => {
    try {
        const { inngest, functions } = await import('../inngest/index.js');
        if (functions && functions.length > 0) {
            const { serve } = await import('inngest/express');
            app.use('/api/inngest', serve({ client: inngest, functions }));
            console.log('\x1b[32m✔ Inngest functions mounted\x1b[0m');
        } else {
            console.warn('\x1b[33m⚠ Inngest skipped — no functions available\x1b[0m');
        }
    } catch (error) {
        console.warn('\x1b[33m⚠ Inngest skipped —\x1b[0m', error.message);
    }
};
mountInngest();

app.use('/api/show', showRouter)
app.use('/api/booking', bookingRouter)
app.use('/api/admin', adminRouter)
app.use('/api/user', userRouter)

// Only call listen() locally — Vercel handles ports automatically
if (!process.env.VERCEL) {
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`\x1b[32m✔ Server running on port ${port}\x1b[0m`);
        console.log(`\x1b[36m➜ Local: http://127.0.0.1:${port}\x1b[0m`);
    });
}

export default app;