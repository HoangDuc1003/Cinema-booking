import 'dotenv/config';
import mongoose from 'mongoose';
import HeroRotationBatch from '../models/HeroRotationBatch.js';
import SiteConfig from '../models/SiteConfig.js';
import { verifyHeroRotationIndexes } from '../configs/indexes.js';

const REQUIRED_INDEXES = [
    'hero_batch_key_unique',
    'hero_run_unique',
    'hero_single_active',
];

const parseDefaultVolume = () => {
    const value = Number(process.env.HERO_DEFAULT_VOLUME || 0.35);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.35;
};

const setMissingConfigFields = async (key, fields) => {
    await SiteConfig.updateOne(
        { key },
        { $setOnInsert: { key } },
        { upsert: true },
    );

    let modifiedCount = 0;
    for (const [path, value] of Object.entries(fields)) {
        const result = await SiteConfig.updateOne(
            { key, [path]: { $exists: false } },
            { $set: { [path]: value } },
        );
        modifiedCount += result.modifiedCount;
    }
    return modifiedCount;
};

const assertExistingBatchesCanBeIndexed = async () => {
    const invalidBatch = (await HeroRotationBatch.find({}))
        .find((batch) => batch.validateSync());
    if (invalidBatch) {
        throw new Error(`Cannot migrate: Hero rotation batch ${invalidBatch._id} violates schema invariants`);
    }

    const duplicateBatchKeys = await HeroRotationBatch.aggregate([
        { $group: { _id: '$batchKey', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: 1 },
    ]);
    if (duplicateBatchKeys.length) {
        throw new Error(`Cannot migrate: duplicate Hero batchKey ${duplicateBatchKeys[0]._id}`);
    }

    await HeroRotationBatch.collection.updateMany(
        { runId: { $in: [null, ''] } },
        { $unset: { runId: '' } },
    );
    const duplicateRunIds = await HeroRotationBatch.aggregate([
        { $match: { runId: { $exists: true, $nin: [null, ''] } } },
        { $group: { _id: '$runId', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: 1 },
    ]);
    if (duplicateRunIds.length) {
        throw new Error(`Cannot migrate: duplicate Hero runId ${duplicateRunIds[0]._id}`);
    }

    const activeCount = await HeroRotationBatch.countDocuments({ status: 'active' });
    if (activeCount > 1) {
        throw new Error('Cannot migrate: more than one active Hero rotation batch exists');
    }
};

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI environment variable is not set');
    }
    await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || 5000,
        socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS) || 15000,
        maxPoolSize: 5,
        family: 4,
        autoCreate: false,
        autoIndex: false,
    });

    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') {
        throw new Error('Hero rotation requires MongoDB replica-set or Atlas transaction support');
    }

    const collectionExists = await mongoose.connection.db
        .listCollections({ name: HeroRotationBatch.collection.name }, { nameOnly: true })
        .hasNext();
    if (!collectionExists) {
        await HeroRotationBatch.createCollection();
    }

    await assertExistingBatchesCanBeIndexed();
    await HeroRotationBatch.createIndexes();
    await verifyHeroRotationIndexes();

    const heroRotationFields = {
        'heroRotation.activeBatchId': null,
        'heroRotation.lastSuccessfulRefreshAt': null,
        'heroRotation.nextRefreshAt': null,
        'heroRotation.cacheGeneration': 0,
        'heroRotation.lastFencingToken': 0,
        'heroRotation.refreshing': false,
    };
    const homeHeroFields = {
        'homeHero.heroSoundDefaultEnabled': false,
        'homeHero.heroDefaultVolume': parseDefaultVolume(),
    };
    const configDefaultsApplied = (
        await setMissingConfigFields('heroRotation', heroRotationFields)
        + await setMissingConfigFields('homeHero', homeHeroFields)
    );

    console.info('[hero-rotation-migration]', JSON.stringify({
        indexes: REQUIRED_INDEXES,
        configDefaultsApplied,
    }));
}

main()
    .then(async () => {
        await mongoose.disconnect();
        process.exit(0);
    })
    .catch(async (error) => {
        console.error('[hero-rotation-migration]', error.message);
        await mongoose.disconnect().catch(() => undefined);
        process.exit(1);
    });
