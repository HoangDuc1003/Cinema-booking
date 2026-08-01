import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../configs/db.js';
import { getRedisClient } from '../configs/redis.js';
import { syncNowPlayingShows } from '../services/nowPlayingShowSyncService.js';

const run = async () => {
    await connectDB({ ensureIndexes: false });
    const summary = await syncNowPlayingShows({ requestedBy: 'manual-script' });
    console.log(JSON.stringify({
        event: 'manual-now-playing-sync-complete',
        success: summary.success,
        skipped: Boolean(summary.skipped),
        code: summary.code,
        region: summary.region,
        movies: summary.movies,
        showsCreated: summary.showsCreated,
        showsReused: summary.showsReused,
        showsClosed: summary.showsClosed,
    }));
    if (!summary.success) process.exitCode = 1;
};

try {
    await run();
} catch (error) {
    console.error(JSON.stringify({
        event: 'manual-now-playing-sync-failed',
        errorCode: error?.code || error?.name || 'SYNC_FAILED',
    }));
    process.exitCode = 1;
} finally {
    try { getRedisClient()?.destroy(); } catch { /* best effort */ }
    await mongoose.disconnect().catch(() => {});
}
