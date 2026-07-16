import 'dotenv/config';
import mongoose from 'mongoose';
import CatalogBatch from '../models/CatalogBatch.js';
import CatalogRefreshRun from '../models/CatalogRefreshRun.js';
import { verifyCatalogV2Indexes } from '../configs/indexes.js';

const REQUIRED_INDEXES = ['catalog_week_version_unique', 'catalog_run_unique', 'catalog_single_active'];

async function main() {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI environment variable is not set');
    await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || 5000,
        socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS) || 15000,
        maxPoolSize: 5,
        family: 4,
    });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') {
        throw new Error('Catalog v2 requires MongoDB replica-set or Atlas transaction support');
    }
    const collection = CatalogBatch.collection;
    const conflicts = await collection.aggregate([
        { $group: { _id: { weekKey: '$weekKey', version: { $ifNull: ['$version', 1] } }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
    ]).toArray();
    if (conflicts.length) throw new Error('Cannot migrate: duplicate weekKey/version values would exist after backfill');
    const activeCount = await collection.countDocuments({ status: 'active' });
    if (activeCount > 1) throw new Error('Cannot migrate: more than one active catalog batch exists');
    const materializedBatches = await collection.find({ status: { $nin: ['failed', 'building'] } }).toArray();
    const invalidBatch = materializedBatches.find((batch) => {
        const buckets = [batch.buckets?.newest, batch.buckets?.popular, batch.buckets?.classics];
        const bucketIds = buckets.flatMap((bucket) => Array.isArray(bucket) ? bucket : []);
        const movieIds = Array.isArray(batch.movieIds) ? batch.movieIds : [];
        const bucketSet = new Set(bucketIds.map(String));
        return buckets.some((bucket) => !Array.isArray(bucket) || bucket.length !== 50 || new Set(bucket.map(String)).size !== 50)
            || bucketIds.length !== 150
            || bucketSet.size !== 150
            || movieIds.length !== 150
            || new Set(movieIds.map(String)).size !== 150
            || movieIds.some((id) => !bucketSet.has(String(id)));
    });
    if (invalidBatch) throw new Error(`Cannot migrate: catalog batch ${invalidBatch._id} violates the 50/50/50 invariant`);

    const legacyBatches = await collection.find({
        $or: [
            { version: { $exists: false } },
            { runId: { $exists: false } },
            { fencingToken: { $exists: false } },
        ],
    }).toArray();

    for (const batch of legacyBatches) {
        await collection.updateOne(
            { _id: batch._id },
            {
                $set: {
                    version: batch.version || 1,
                    runId: batch.runId || `legacy:${batch._id}`,
                    fencingToken: batch.fencingToken || 1,
                },
            },
        );
    }

    const indexes = await collection.indexes();
    if (indexes.some((index) => index.name === 'weekKey_1')) await collection.dropIndex('weekKey_1');
    await CatalogBatch.createIndexes();
    await CatalogRefreshRun.createIndexes();
    await verifyCatalogV2Indexes();

    const finalIndexes = await collection.indexes();
    const names = new Set(finalIndexes.map((index) => index.name));
    const missing = REQUIRED_INDEXES.filter((name) => !names.has(name));
    const runIndexes = new Set((await CatalogRefreshRun.collection.indexes()).map((index) => index.name));
    if (missing.length || names.has('weekKey_1') || !runIndexes.has('catalog_refresh_run_unique')) {
        throw new Error(`Catalog v2 index verification failed: ${missing.join(', ') || 'legacy index remains'}`);
    }
    console.info('[catalog-migration]', JSON.stringify({
        migratedBatches: legacyBatches.length,
        indexes: REQUIRED_INDEXES,
    }));
}

main()
    .then(async () => {
        await mongoose.disconnect();
        process.exit(0);
    })
    .catch(async (error) => {
        console.error('[catalog-migration]', error.message);
        await mongoose.disconnect().catch(() => undefined);
        process.exit(1);
    });
