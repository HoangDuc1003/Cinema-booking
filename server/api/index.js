import express from 'express';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { clerkMiddleware } from '@clerk/express';
import connectDB from '../configs/db.js';
import { connectRedis, getRedisHealth } from '../configs/redis.js';
import showRouter from '../routes/showRoutes.js';
import bookingRouter from '../routes/bookingRoutes.js';
import adminRouter from '../routes/adminRoutes.js';
import userRouter from '../routes/userRoutes.js';
import { stripeWebhooks } from '../controllers/stripeWebhooks.js';
import {
    getClerkConfigStatus,
    getConfiguredClientUrl,
    getPaymentConfigStatus,
    validateClerkConfig,
} from '../configs/runtimeConfig.js';
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

const requestIdFor = (req) => {
    const candidate = req.get?.('x-request-id');
    return /^[A-Za-z0-9._:-]{1,100}$/.test(String(candidate || '')) ? String(candidate) : randomUUID();
};

app.use((req, res, next) => {
    req.requestId = requestIdFor(req);
    res.set('X-Request-Id', req.requestId);
    next();
});

try {
    const clerkValidation = validateClerkConfig();
    if (clerkValidation.warning) {
        console.warn(JSON.stringify({
            event: 'runtime-config-warning',
            config: 'clerk',
            warningCode: clerkValidation.warning,
        }));
    }
} catch (error) {
    console.error(JSON.stringify({ event: 'runtime-config-invalid', config: 'clerk', errorCode: error.code }));
}

// CORS and preflight must complete before body parsing, Clerk and database work.
// The policy uses a normalized explicit allowlist and never combines `*` with credentials.
app.use(createCorsMiddleware());
app.use(handleCorsError);

// Stripe signature verification requires the untouched request bytes.
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhooks);

app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => res.send('Server is live!'));
app.get('/api/health', async (req, res) => res.status(200).json({ success: true, status: 'ok' }));

app.get('/api/health/ready', async (req, res) => {
    let database = { connected: false, status: 'unavailable' };
    try {
        await connectDB({ ensureIndexes: false });
        database = { connected: true, status: 'ready' };
    } catch {
        database = { connected: false, status: 'unavailable' };
    }
    const redis = await getRedisHealth();
    const paymentConfig = getPaymentConfigStatus();
    const clerkConfig = getClerkConfigStatus();
    let clientUrl = paymentConfig.clientUrl;
    try {
        clientUrl = { configured: Boolean(getConfiguredClientUrl()) };
    } catch {
        clientUrl = { configured: false };
    }
    const configurationReady = clerkConfig.publishableKey.configured
        && clerkConfig.secretKey.configured
        && Boolean(process.env.TMDB_API_KEY)
        && clientUrl.configured;
    const ready = database.connected && configurationReady && (!redis.configured || redis.connected);
    return res.status(ready ? 200 : 503).json({
        success: ready,
        status: ready ? 'ready' : 'unavailable',
        dependencies: {
            database,
            redis,
            clerk: clerkConfig,
            tmdb: { configured: Boolean(process.env.TMDB_API_KEY) },
            clientUrl,
        },
    });
});

app.use(clerkMiddleware({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
}));

app.use(async (req, res, next) => {
    const isPublicShowRead = req.method === 'GET' && req.path.startsWith('/api/show');
    const timing = {};
    try {
        await connectDB({ ensureIndexes: !isPublicShowRead, timing });
        req.nitroTiming = timing;
        next();
    } catch (error) {
        console.error(JSON.stringify({
            event: 'database-connection-failed',
            path: req.path,
            method: req.method,
            errorCode: error?.code || error?.name || 'UNKNOWN',
            requestId: req.requestId,
        }));
        res.set('Cache-Control', 'private, no-store');
        return res.status(503).json({
            success: false,
            code: error?.code === 'INVALID_CONFIGURATION' ? 'INVALID_CONFIGURATION' : 'DATABASE_UNAVAILABLE',
            requestId: req.requestId,
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
