import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../configs/db.js';
import { connectRedis } from '../configs/redis.js';
import { getISOWeekKey, buildWeeklyCatalogBatch, activateCatalogBatch } from '../services/catalogRefreshService.js';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`[Seeder] Starting weekly movie catalog seeder. Dry-run: ${dryRun}`);
    
    try {
        await connectDB();
        
        let redisClient = null;
        if (!dryRun) {
            redisClient = await connectRedis();
        }
        
        const now = new Date();
        const weekKey = getISOWeekKey(now);
        console.log(`[Seeder] Calculated ISO week key: ${weekKey}`);
        
        const { batch, movies } = await buildWeeklyCatalogBatch(weekKey);
        console.log(`[Seeder] Built batch with ${movies.length} validated movies.`);
        
        if (dryRun) {
            console.log(`[Seeder] Dry-run: skipping Mongo upserts and Redis lock activation.`);
            // Clean up staging batch
            await mongoose.connection.collection('catalogbatches').deleteOne({ _id: batch._id });
            console.log(`[Seeder] Cleaned up temporary dry-run staging batch.`);
        } else {
            console.log(`[Seeder] Activating batch ${batch._id}...`);
            await activateCatalogBatch(batch._id, movies);
            console.log(`[Seeder] Batch ${batch._id} successfully activated.`);
        }
        
        await mongoose.disconnect();
        if (redisClient && redisClient.isReady) {
            await redisClient.quit();
        }
        console.log(`[Seeder] Seeding finished successfully.`);
        process.exit(0);
    } catch (err) {
        console.error(`[Seeder] Seeding failed:`, err);
        try {
            await mongoose.disconnect();
        } catch (e) {}
        process.exit(1);
    }
}

main();
