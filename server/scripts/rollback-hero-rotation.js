import 'dotenv/config';
import mongoose from 'mongoose';
import HeroRotationBatch from '../models/HeroRotationBatch.js';
import Movie from '../models/Movie.js';
import SiteConfig from '../models/SiteConfig.js';
import { verifyHeroRotationIndexes } from '../configs/indexes.js';
import {
    deleteByPattern,
    deleteKeys,
    getJson,
} from '../services/cacheService.js';
import {
    acquireFencedLock,
    releaseFencedLock,
    verifyFencedLock,
} from '../services/lockService.js';
import { redisKeys, redisTtl } from '../services/redisKeys.js';

const HERO_INDEXES = [
    'hero_batch_key_unique',
    'hero_run_unique',
    'hero_single_active',
];

const isDefaultHeroRotationConfig = (config) => {
    const state = config?.heroRotation || {};
    return !state.activeBatchId
        && !state.lastSuccessfulRefreshAt
        && !state.nextRefreshAt
        && Number(state.cacheGeneration || 0) === 0
        && Number(state.lastFencingToken || 0) === 0
        && state.refreshing !== true;
};

const rollbackFoundation = async () => {
    const lock = await acquireFencedLock(
        redisKeys.heroRefreshLock(),
        redisKeys.heroRefreshFence(),
        { ttlMs: redisTtl.heroRefreshLockMs, waitMs: 10000 },
    );
    try {
        if (!await verifyFencedLock(lock)) throw new Error('Hero foundation rollback lease was lost');

        // Every preflight read stays under the same fenced lease as the destructive operations.
        const config = await SiteConfig.findOne({ key: 'heroRotation' }).lean();
        if (config && !isDefaultHeroRotationConfig(config)) {
            throw new Error(
                'Refusing foundation rollback because Hero rotation config is in use; preserve data and roll back application code only',
            );
        }
        const collectionExists = await mongoose.connection.db
            .listCollections({ name: HeroRotationBatch.collection.name }, { nameOnly: true })
            .hasNext();
        if (collectionExists) {
            const batchCount = await HeroRotationBatch.collection.countDocuments();
            if (batchCount > 0) {
                throw new Error('Refusing foundation rollback because Hero rotation batches exist; preserve data and roll back application code only');
            }
        }

        if (!await verifyFencedLock(lock)) throw new Error('Hero foundation rollback lease was lost before destructive changes');
        let removedEmptyCollection = false;
        if (collectionExists) {
            await mongoose.connection.db.dropCollection(HeroRotationBatch.collection.name);
            removedEmptyCollection = true;
        }

        if (!await verifyFencedLock(lock)) throw new Error('Hero foundation rollback lease was lost before config removal');
        let removedDefaultConfig = false;
        if (config) {
            const currentConfig = await SiteConfig.findOne({ _id: config._id, key: 'heroRotation' }).lean();
            if (currentConfig && !isDefaultHeroRotationConfig(currentConfig)) {
                throw new Error('Refusing foundation rollback because Hero rotation config changed while validating rollback');
            }
            if (currentConfig) {
                await SiteConfig.deleteOne({ _id: currentConfig._id, key: 'heroRotation' });
                removedDefaultConfig = true;
            }
        }

        console.info('[hero-rotation-rollback]', JSON.stringify({
            indexes: HERO_INDEXES,
            removedEmptyCollection,
            removedDefaultConfig,
            preservedMovieMetadata: true,
            preservedHomeHeroPreferences: true,
        }));
    } finally {
        await releaseFencedLock(lock);
    }
};

const assertRollbackTargetAssets = async (target, session, validateNativeHeroMovie) => {
    const validationError = target.validateSync();
    if (validationError) {
        throw new Error(`Rollback target violates Hero batch invariants: ${validationError.message}`);
    }
    const movieIds = target.movieIds.map(String);
    const movies = await Movie.find({ _id: { $in: movieIds } }).session(session).lean();
    if (movies.length !== movieIds.length) {
        throw new Error('Rollback target does not resolve to all 15 persisted movies');
    }
    const validations = movies.map((movie) => validateNativeHeroMovie(movie));
    const invalid = validations.filter((result) => !result.valid);
    if (invalid.length) {
        throw new Error(`Rollback target has invalid native trailers for movie IDs: ${invalid.map((item) => item.movieId).join(', ')}`);
    }
    const urls = movies.map((movie) => String(movie.heroVideoUrl || ''));
    if (new Set(urls).size !== movieIds.length) {
        throw new Error('Rollback target contains shared native trailer URLs');
    }
};

const rollbackActiveBatch = async (batchId) => {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') {
        throw new Error('Hero batch rollback requires MongoDB replica-set or Atlas transaction support');
    }
    await verifyHeroRotationIndexes();
    const {
        calculateNextHeroRefreshAt,
        getPublicHeroRotation,
        validateNativeHeroMovie,
    } = await import('../services/heroRotationService.js');
    const config = await SiteConfig.findOne({ key: 'heroRotation' })
        .select('heroRotation.lastFencingToken')
        .lean();
    const lock = await acquireFencedLock(
        redisKeys.heroRefreshLock(),
        redisKeys.heroRefreshFence(),
        {
            ttlMs: redisTtl.heroRefreshLockMs,
            waitMs: 10000,
            minimumFencingToken: config?.heroRotation?.lastFencingToken || 0,
        },
    );
    let session = null;
    let activatedBatch = null;
    let activatedCacheGeneration = 0;
    try {
        session = await mongoose.startSession();
        await session.withTransaction(async () => {
            if (!await verifyFencedLock(lock)) {
                throw new Error('Hero rollback lease was lost');
            }
            const target = await HeroRotationBatch.findById(batchId).session(session);
            if (!target || !['retired', 'active'].includes(target.status)) {
                throw new Error('Rollback target must be a retained retired or already active Hero rotation batch');
            }
            await assertRollbackTargetAssets(target, session, validateNativeHeroMovie);

            const now = new Date();
            const wasRetired = target.status === 'retired';
            const nextRefreshAt = wasRetired
                ? calculateNextHeroRefreshAt(now, target.timezone)
                : target.nextRefreshAt;
            if (wasRetired) {
                await HeroRotationBatch.updateMany(
                    { status: 'active', _id: { $ne: target._id } },
                    { $set: { status: 'retired', retiredAt: now } },
                    { session },
                );
            }
            target.status = 'active';
            if (wasRetired) target.activatedAt = now;
            target.retiredAt = null;
            target.nextRefreshAt = nextRefreshAt;
            target.fencingToken = lock.fencingToken;
            target.sourceMetadata = {
                ...(target.sourceMetadata || {}),
                ...(wasRetired ? { rolledBackAt: now } : { rollbackCacheRewarmedAt: now }),
                rollbackFencingToken: lock.fencingToken,
            };
            await target.save({ session });

            await SiteConfig.updateOne(
                { key: 'heroRotation' },
                {
                    $setOnInsert: {
                        key: 'heroRotation',
                        'heroRotation.lastFencingToken': 0,
                    },
                },
                { upsert: true, session },
            );
            const updatedConfig = await SiteConfig.findOneAndUpdate(
                {
                    key: 'heroRotation',
                    $or: [
                        { 'heroRotation.lastFencingToken': { $lt: lock.fencingToken } },
                        { 'heroRotation.lastFencingToken': { $exists: false } },
                    ],
                },
                {
                    $set: {
                        'heroRotation.activeBatchId': target._id,
                        ...(wasRetired
                            ? { 'heroRotation.lastSuccessfulRefreshAt': now }
                            : {}),
                        'heroRotation.nextRefreshAt': nextRefreshAt,
                        'heroRotation.lastFencingToken': lock.fencingToken,
                        'heroRotation.refreshing': false,
                    },
                    $inc: { 'heroRotation.cacheGeneration': 1 },
                },
                { new: true, session },
            );
            if (!updatedConfig || !await verifyFencedLock(lock)) {
                throw new Error('Hero rollback fencing token is stale');
            }
            activatedCacheGeneration = Number(updatedConfig.heroRotation?.cacheGeneration || 0);
            activatedBatch = target;
        });

        await deleteByPattern(redisKeys.heroActivePattern());
        await deleteByPattern(redisKeys.homeHeroPattern());
        await deleteKeys(redisKeys.homeHero(), redisKeys.heroLastGood());
        const payload = await getPublicHeroRotation();
        const [warmedPayload, warmedLastGood] = await Promise.all([
            getJson(redisKeys.heroActive(
                activatedBatch._id,
                activatedBatch.version,
                activatedCacheGeneration,
            )),
            getJson(redisKeys.heroLastGood()),
        ]);
        if (
            payload?.batchId !== String(activatedBatch._id)
            || payload?.movies?.length !== 5
            || warmedPayload?.batchId !== String(activatedBatch._id)
            || warmedLastGood?.batchId !== String(activatedBatch._id)
        ) {
            throw new Error('Hero rollback committed but cache warming did not return the reactivated batch');
        }
        console.info('[hero-rotation-rollback]', JSON.stringify({
            batchId: String(activatedBatch._id),
            version: activatedBatch.version,
            nextRefreshAt: activatedBatch.nextRefreshAt,
            movieCount: payload.movies.length,
            cacheWarmed: true,
        }));
    } finally {
        await session?.endSession();
        await releaseFencedLock(lock);
    }
};

async function main() {
    const batchArg = process.argv.find((value) => value.startsWith('--batch-id='));
    const batchId = batchArg?.slice('--batch-id='.length);
    if (batchArg && (!batchId || !mongoose.isValidObjectId(batchId))) {
        throw new Error('--batch-id must be a valid MongoDB ObjectId');
    }
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
    if (batchId) {
        await rollbackActiveBatch(batchId);
        return;
    }
    await rollbackFoundation();
}

main()
    .then(async () => {
        await mongoose.disconnect();
        process.exit(0);
    })
    .catch(async (error) => {
        console.error('[hero-rotation-rollback]', error.message);
        await mongoose.disconnect().catch(() => undefined);
        process.exit(1);
    });
