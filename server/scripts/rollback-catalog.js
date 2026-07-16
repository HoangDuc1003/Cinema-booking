import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../configs/db.js';
import { connectRedis } from '../configs/redis.js';
import { verifyCatalogV2Indexes } from '../configs/indexes.js';
import CatalogBatch from '../models/CatalogBatch.js';
import SiteConfig from '../models/SiteConfig.js';
import { acquireFencedLock, releaseFencedLock, verifyFencedLock } from '../services/lockService.js';
import { deleteByPattern, deleteKeys } from '../services/cacheService.js';
import { calculateCurrentSlot, getPublicHomePayload } from '../services/catalogRefreshService.js';
import { redisKeys, redisTtl } from '../services/redisKeys.js';

async function main() {
    const batchArg = process.argv.find((value) => value.startsWith('--batch-id='));
    const batchId = batchArg?.slice('--batch-id='.length);
    if (!batchId || !mongoose.isValidObjectId(batchId)) throw new Error('A valid --batch-id is required');
    await connectDB();
    await connectRedis({ required: true });
    await verifyCatalogV2Indexes();
    const fenceConfig = await SiteConfig.findOne({ key: 'catalog' }).select('catalog.lastFencingToken').lean();
    const lock = await acquireFencedLock(redisKeys.catalogRefreshLock(), redisKeys.catalogRefreshFence(), {
        ttlMs: redisTtl.catalogRefreshLockMs,
        waitMs: 10000,
        minimumFencingToken: fenceConfig?.catalog?.lastFencingToken || 0,
    });
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            if (!await verifyFencedLock(lock)) throw new Error('Rollback lease was lost');
            const target = await CatalogBatch.findById(batchId).session(session);
            if (!target || !['retired', 'active'].includes(target.status)) throw new Error('Rollback target must be a retained catalog batch');
            await CatalogBatch.updateMany(
                { status: 'active', _id: { $ne: target._id } },
                { $set: { status: 'retired', retiredAt: new Date() } },
                { session },
            );
            target.status = 'active';
            target.activatedAt = new Date();
            target.retiredAt = null;
            target.fencingToken = lock.fencingToken;
            await target.save({ session });
            const config = await SiteConfig.findOneAndUpdate(
                { key: 'catalog', 'catalog.lastFencingToken': { $lt: lock.fencingToken } },
                {
                    $set: {
                        'catalog.activeBatchId': target._id,
                        'catalog.activeSlot': calculateCurrentSlot(new Date()),
                        'catalog.lastFencingToken': lock.fencingToken,
                        'catalog.lastRotationAt': new Date(),
                    },
                },
                { new: true, session },
            );
            if (!config || !await verifyFencedLock(lock)) throw new Error('Rollback fencing token is stale');
        });
        await deleteByPattern(redisKeys.catalogSlotPattern());
        await deleteByPattern(redisKeys.tmdbTrailersPattern());
        await deleteKeys(redisKeys.homeHero());
        const payload = await getPublicHomePayload();
        console.info('[catalog-rollback]', JSON.stringify({ batchId, meta: payload.meta }));
    } finally {
        await session.endSession();
        await releaseFencedLock(lock);
    }
}

main()
    .then(async () => {
        await mongoose.disconnect();
        process.exit(0);
    })
    .catch(async (error) => {
        console.error('[catalog-rollback]', error.message);
        await mongoose.disconnect().catch(() => undefined);
        process.exit(1);
    });
