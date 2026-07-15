import express from 'express';
import 'dotenv/config';
import { clerkMiddleware } from '@clerk/express';
import connectDB from '../configs/db.js';
import { connectRedis, getRedisHealth } from '../configs/redis.js';
import showRouter from '../routes/showRoutes.js';
import bookingRouter from '../routes/bookingRoutes.js';
import adminRouter from '../routes/adminRoutes.js';
import userRouter from '../routes/userRoutes.js';
import { stripeWebhooks } from '../controllers/stripeWebhooks.js';
import { getPaymentConfigStatus } from '../configs/runtimeConfig.js';
import { connectCloudinary } from '../configs/cloudinary.js';
import { createCorsMiddleware, handleCorsError } from '../middleware/corsPolicy.js';

connectCloudinary();

process.on('unhandledRejection', (reason) => {
    console.error('[Unhandled rejection]', reason);
});

process.on('uncaughtException', (error) => {
    console.error('[Uncaught exception]', error);
    if (!process.env.VERCEL) process.exit(1);
});

const app = express();

// CORS and preflight must complete before body parsing, Clerk and database work.
// The policy uses a normalized explicit allowlist and never combines `*` with credentials.
app.use(createCorsMiddleware());
app.use(handleCorsError);

// Stripe signature verification requires the untouched request bytes.
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhooks);

app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => res.send('Server is live!'));
app.get('/api/health', async (req, res) => {
    let database = { connected: false, status: 'unavailable' };
    try {
        await connectDB();
        database = { connected: true, status: 'ready' };
    } catch (error) {
        database = { connected: false, status: 'unavailable' };
    }

    const redis = await getRedisHealth();
    const paymentConfig = getPaymentConfigStatus();
    const healthy = database.connected;
    return res.status(healthy ? 200 : 503).json({
        success: healthy,
        status: healthy && redis.connected ? 'ok' : (healthy ? 'degraded' : 'unavailable'),
        dependencies: {
            database,
            redis,
            stripe: paymentConfig.stripe,
            clientUrl: paymentConfig.clientUrl,
        },
    });
});

app.use(clerkMiddleware({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
}));

app.use(async (req, res, next) => {
    if (req.path.startsWith('/api/show/tmdb')) {
        return next();
    }

    try {
        await connectDB();
        next();
    } catch (error) {
        console.error('[DB middleware] Connection failed:', error.message);
        return res.status(503).json({
            success: false,
            message: 'Database temporarily unavailable. Please retry.',
        });
    }
});

const mountInngest = async () => {
    try {
        const { inngest, functions } = await import('../inngest/index.js');
        if (functions?.length) {
            const { serve } = await import('inngest/express');
            app.use('/api/inngest', serve({ client: inngest, functions }));
            console.log('[Inngest] Functions mounted');
        }
    } catch (error) {
        console.warn('[Inngest] Skipped:', error.message);
    }
};

mountInngest();
connectRedis().catch((error) => {
    console.warn('[Redis] Startup connection deferred:', error.message);
});

app.use('/api/show', showRouter);
app.use('/api/booking', bookingRouter);
app.use('/api/admin', adminRouter);
app.use('/api/user', userRouter);

if (!process.env.VERCEL) {
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`[Server] http://127.0.0.1:${port}`);
    });
}

export default app;
