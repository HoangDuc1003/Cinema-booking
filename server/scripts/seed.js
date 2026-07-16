import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import connectDB from '../configs/db.js';
import { connectRedis } from '../configs/redis.js';
import { refreshWeeklyCatalog } from '../services/catalogRefreshService.js';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const runIdArg = process.argv.find((value) => value.startsWith('--run-id='));
    const runId = runIdArg ? runIdArg.slice('--run-id='.length) : randomUUID();
    try {
        await connectDB();
        const redis = await connectRedis({ required: true });
        const result = await refreshWeeklyCatalog({
            dryRun,
            source: 'cli',
            runId,
            requestedBy: 'cli',
        });
        console.info('[catalog-seed]', JSON.stringify(result));
        await mongoose.disconnect();
        if (redis?.isReady) await redis.quit();
        process.exit(0);
    } catch (error) {
        console.error('[catalog-seed]', JSON.stringify({ runId, code: error.code || 'FAILED', message: error.message }));
        await mongoose.disconnect().catch(() => undefined);
        process.exit(1);
    }
}

main();
