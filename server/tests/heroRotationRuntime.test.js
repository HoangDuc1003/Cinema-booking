import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import CatalogBatch from '../models/CatalogBatch.js';
import HeroRotationBatch from '../models/HeroRotationBatch.js';
import Movie from '../models/Movie.js';
import SiteConfig from '../models/SiteConfig.js';
import {
    getPublicHeroRotation,
    HeroRotationError,
    heroRotationRuntime,
    rerandomizeActiveHero,
    refreshHeroRotation,
} from '../services/heroRotationService.js';

const nativeMovie = (id) => ({
    _id: id,
    title: `Movie ${id}`,
    overview: `Overview ${id}`,
    poster_path: `/poster-${id}.jpg`,
    backdrop_path: `/backdrop-${id}.jpg`,
    release_date: '2026-07-01',
    vote_average: 8,
    vote_count: 1000,
    popularity: 100,
    adult: false,
    runtime: 110,
    genres: [],
    heroVideoId: `hero_trailers/${id}/official`,
    heroVideoMovieId: id,
    heroVideoUrl: `https://res.cloudinary.com/test/video/upload/${id}.mp4`,
    heroVideoMimeType: 'video/mp4',
    heroVideoStatus: 'ready',
    heroVideoVersion: '1',
    heroVideoDuration: 90,
    heroVideoWidth: 1920,
    heroVideoHeight: 1080,
    heroVideoBytes: 5_000_000,
    heroVideoCodec: 'h264/aac',
    heroVideoPosterUrl: `https://res.cloudinary.com/test/image/upload/${id}.jpg`,
    heroVideoVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
    heroVideoSource: 'cloudinary',
    heroVideoAttribution: 'Licensed test fixture',
});

const query = (loader) => ({
    select() {
        return this;
    },
    sort() {
        return this;
    },
    session() {
        return this;
    },
    lean: async () => loader(),
});

const installPublicCacheHarness = (t) => {
    const originals = {
        configFindOne: SiteConfig.findOne,
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        batchFindById: HeroRotationBatch.findById,
        batchFindOne: HeroRotationBatch.findOne,
        movieFind: Movie.find,
        getJson: heroRotationRuntime.getJson,
        setJson: heroRotationRuntime.setJson,
    };
    const cache = new Map();
    const batch = {
        _id: 'batch-cache-1',
        batchKey: '2026-07-30',
        version: 3,
        status: 'active',
        generatedAt: new Date('2026-07-30T00:00:00.000Z'),
        activatedAt: new Date('2026-07-30T00:00:00.000Z'),
        nextRefreshAt: new Date('2026-08-01T17:00:00.000Z'),
        timezone: 'Asia/Ho_Chi_Minh',
        activeHeroMovieIds: ['new-0', 'hot-0', 'discovery-0', 'new-1', 'hot-1'],
    };
    let movies = batch.activeHeroMovieIds.map(nativeMovie);
    SiteConfig.findOne = ({ key }) => query(() => (
        key === 'heroRotation'
            ? { heroRotation: { activeBatchId: batch._id, cacheGeneration: 7 } }
            : null
    ));
    SiteConfig.findOneAndUpdate = () => query(() => ({
        updatedAt: new Date('2026-07-30T00:00:00.000Z'),
        homeHero: {
            mode: 'auto',
            movieIds: [],
            heroSoundDefaultEnabled: false,
            heroDefaultVolume: 0.35,
        },
    }));
    HeroRotationBatch.findById = () => query(() => batch);
    HeroRotationBatch.findOne = () => query(() => batch);
    Movie.find = () => query(() => movies);
    heroRotationRuntime.getJson = async (key) => cache.get(key) || null;
    heroRotationRuntime.setJson = async (key, value) => {
        cache.set(key, structuredClone(value));
        return true;
    };
    t.after(() => {
        SiteConfig.findOne = originals.configFindOne;
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        HeroRotationBatch.findById = originals.batchFindById;
        HeroRotationBatch.findOne = originals.batchFindOne;
        Movie.find = originals.movieFind;
        heroRotationRuntime.getJson = originals.getJson;
        heroRotationRuntime.setJson = originals.setJson;
    });
    return {
        batch,
        cache,
        invalidateMovies: () => {
            movies = movies.map((movie) => ({ ...movie, heroVideoStatus: 'missing' }));
        },
    };
};

test('public Hero service performs generation-versioned cache miss, hit, and last-good fallback', async (t) => {
    const harness = installPublicCacheHarness(t);
    const first = await getPublicHeroRotation();
    assert.equal(first.cache, 'miss');
    assert.equal(first.movies.length, 5);
    const activeKey = [...harness.cache.keys()].find((key) => key.includes(':hero:active:'));
    assert.match(activeKey, /:batch-cache-1:3:7$/);

    const second = await getPublicHeroRotation();
    assert.equal(second.cache, 'hit');
    assert.deepEqual(second.movies.map((movie) => movie.id), first.movies.map((movie) => movie.id));

    harness.cache.delete(activeKey);
    harness.invalidateMovies();
    const fallback = await getPublicHeroRotation();
    assert.equal(fallback.cache, 'last-good');
    assert.equal(fallback.batchId, 'batch-cache-1');
    assert.equal(fallback.movies.length, 5);
});

const installRefreshHarness = (t, { warmFailures = 0 } = {}) => {
    const originals = {
        configFindOne: SiteConfig.findOne,
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        configUpdateOne: SiteConfig.updateOne,
        catalogFindOne: CatalogBatch.findOne,
        batchFindOne: HeroRotationBatch.findOne,
        batchFindOneAndUpdate: HeroRotationBatch.findOneAndUpdate,
        batchFindById: HeroRotationBatch.findById,
        batchUpdateMany: HeroRotationBatch.updateMany,
        batchUpdateOne: HeroRotationBatch.updateOne,
        movieFind: Movie.find,
        startSession: mongoose.startSession,
        acquire: heroRotationRuntime.acquireFencedLock,
        verify: heroRotationRuntime.verifyFencedLock,
        renew: heroRotationRuntime.renewFencedLock,
        release: heroRotationRuntime.releaseFencedLock,
        getJson: heroRotationRuntime.getJson,
        setRequiredJson: heroRotationRuntime.setRequiredJson,
        deleteKeys: heroRotationRuntime.deleteKeys,
        deleteByPattern: heroRotationRuntime.deleteByPattern,
        buildPool: heroRotationRuntime.buildPool,
        getPublicRotation: heroRotationRuntime.getPublicRotation,
    };
    const movies = [
        ...Array.from({ length: 5 }, (_, index) => nativeMovie(`new-${index}`)),
        ...Array.from({ length: 5 }, (_, index) => nativeMovie(`hot-${index}`)),
        ...Array.from({ length: 5 }, (_, index) => nativeMovie(`discovery-${index}`)),
    ];
    const pool = {
        newestMovieIds: movies.slice(0, 5).map((movie) => movie._id),
        hotMovieIds: movies.slice(5, 10).map((movie) => movie._id),
        discoveryMovieIds: movies.slice(10, 15).map((movie) => movie._id),
        movieIds: movies.map((movie) => movie._id),
        activeHeroMovieIds: ['new-0', 'hot-0', 'discovery-0', 'new-1', 'hot-1'],
        sourceMetadata: { catalogBatchId: 'catalog-1', candidateCount: 15 },
    };
    const config = {
        activeBatchId: 'old-active',
        lastSuccessfulRefreshAt: new Date('2026-07-28T00:00:00.000Z'),
        nextRefreshAt: new Date('2026-07-30T00:00:00.000Z'),
        lastFencingToken: 0,
        cacheGeneration: 0,
        refreshing: false,
    };
    let saveCount = 0;
    let buildCount = 0;
    let warmFailureCount = warmFailures;
    const makeBatch = (data) => ({
        ...data,
        async save() {
            saveCount += 1;
            return this;
        },
    });
    const batches = [makeBatch({
        _id: 'old-active',
        batchKey: '2026-07-28',
        runId: 'cron:2026-07-28',
        version: 1,
        status: 'active',
        movieIds: pool.movieIds,
        activeHeroMovieIds: pool.activeHeroMovieIds,
    })];
    const cache = new Map();
    const applyConfigUpdate = (update) => {
        for (const [path, value] of Object.entries(update?.$set || {})) {
            if (path.startsWith('heroRotation.')) config[path.slice('heroRotation.'.length)] = value;
        }
        for (const [path, value] of Object.entries(update?.$inc || {})) {
            if (path.startsWith('heroRotation.')) {
                const key = path.slice('heroRotation.'.length);
                config[key] = Number(config[key] || 0) + Number(value);
            }
        }
    };
    SiteConfig.findOne = () => query(() => ({ heroRotation: { ...config } }));
    SiteConfig.findOneAndUpdate = async (filter, update) => {
        if (
            filter?.$or
            && Number(config.lastFencingToken || 0) >= Number(
                update?.$set?.['heroRotation.lastFencingToken'] || Number.MAX_SAFE_INTEGER,
            )
        ) return null;
        applyConfigUpdate(update);
        return { heroRotation: { ...config } };
    };
    SiteConfig.updateOne = async (filter, update) => {
        applyConfigUpdate(update);
        return { acknowledged: true, modifiedCount: 1 };
    };
    CatalogBatch.findOne = () => query(() => ({
        _id: 'catalog-1',
        status: 'active',
        movieIds: pool.movieIds,
        version: 4,
        weekKey: '2026-W31',
    }));
    const matchBatch = (filter) => {
        if (!filter || Object.keys(filter).length === 0) {
            return [...batches].sort((left, right) => right.version - left.version)[0] || null;
        }
        if (filter.status) return batches.find((batch) => batch.status === filter.status) || null;
        if (filter.batchKey) return batches.find((batch) => batch.batchKey === filter.batchKey) || null;
        if (filter.$or) {
            return batches.find((batch) => filter.$or.some((clause) => (
                (clause.runId && batch.runId === clause.runId)
                || (clause.batchKey && batch.batchKey === clause.batchKey)
            ))) || null;
        }
        return null;
    };
    HeroRotationBatch.findOne = (filter) => query(() => matchBatch(filter));
    HeroRotationBatch.findOneAndUpdate = async (filter, update) => {
        let batch = filter._id
            ? batches.find((candidate) => candidate._id === String(filter._id))
            : batches.find((candidate) => candidate.batchKey === filter.batchKey);
        if (!batch) {
            batch = makeBatch({
                _id: `batch-${batches.length + 1}`,
                ...(update.$setOnInsert || {}),
            });
            batches.push(batch);
        }
        Object.assign(batch, update.$set || {});
        return batch;
    };
    HeroRotationBatch.findById = (id) => ({
        session: async () => batches.find((batch) => batch._id === String(id)) || null,
    });
    HeroRotationBatch.updateMany = async (filter, update) => {
        for (const batch of batches) {
            if (batch.status === 'active' && batch._id !== String(filter._id.$ne)) {
                Object.assign(batch, update.$set || {});
            }
        }
        return { acknowledged: true };
    };
    HeroRotationBatch.updateOne = async (filter, update) => {
        const batch = batches.find((candidate) => (
            candidate._id === String(filter._id)
            && (!filter.status || candidate.status === filter.status)
        ));
        if (!batch) return { matchedCount: 0, modifiedCount: 0 };
        Object.assign(batch, update.$set || {});
        return { matchedCount: 1, modifiedCount: 1 };
    };
    Movie.find = () => query(() => movies);
    mongoose.startSession = async () => ({
        withTransaction: async (task) => task(),
        endSession: async () => undefined,
    });

    let nextFence = 0;
    let lockTail = Promise.resolve();
    heroRotationRuntime.acquireFencedLock = async () => {
        const previous = lockTail;
        let unlock;
        lockTail = new Promise((resolve) => {
            unlock = resolve;
        });
        await previous;
        return { fencingToken: ++nextFence, unlock };
    };
    heroRotationRuntime.verifyFencedLock = async () => true;
    heroRotationRuntime.renewFencedLock = async () => true;
    heroRotationRuntime.releaseFencedLock = async (lock) => {
        lock.unlock();
        return true;
    };
    heroRotationRuntime.getJson = async (key) => cache.get(key) || null;
    heroRotationRuntime.setRequiredJson = async (key, value) => {
        cache.set(key, structuredClone(value));
        return true;
    };
    heroRotationRuntime.deleteKeys = async (...keys) => {
        keys.forEach((key) => cache.delete(key));
        return keys.length;
    };
    heroRotationRuntime.deleteByPattern = async () => 0;
    heroRotationRuntime.buildPool = async () => {
        buildCount += 1;
        return structuredClone(pool);
    };
    heroRotationRuntime.getPublicRotation = async () => {
        const active = batches.find((batch) => batch.status === 'active');
        if (warmFailureCount > 0) {
            warmFailureCount -= 1;
            return { batchId: 'wrong-batch', version: -1, movies: [] };
        }
        return {
            batchId: active ? String(active._id) : null,
            version: active?.version ?? 0,
            movies: active ? pool.activeHeroMovieIds.map((id) => ({ id })) : [],
        };
    };
    t.after(() => {
        SiteConfig.findOne = originals.configFindOne;
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        SiteConfig.updateOne = originals.configUpdateOne;
        CatalogBatch.findOne = originals.catalogFindOne;
        HeroRotationBatch.findOne = originals.batchFindOne;
        HeroRotationBatch.findOneAndUpdate = originals.batchFindOneAndUpdate;
        HeroRotationBatch.findById = originals.batchFindById;
        HeroRotationBatch.updateMany = originals.batchUpdateMany;
        HeroRotationBatch.updateOne = originals.batchUpdateOne;
        Movie.find = originals.movieFind;
        mongoose.startSession = originals.startSession;
        heroRotationRuntime.acquireFencedLock = originals.acquire;
        heroRotationRuntime.verifyFencedLock = originals.verify;
        heroRotationRuntime.renewFencedLock = originals.renew;
        heroRotationRuntime.releaseFencedLock = originals.release;
        heroRotationRuntime.getJson = originals.getJson;
        heroRotationRuntime.setRequiredJson = originals.setRequiredJson;
        heroRotationRuntime.deleteKeys = originals.deleteKeys;
        heroRotationRuntime.deleteByPattern = originals.deleteByPattern;
        heroRotationRuntime.buildPool = originals.buildPool;
        heroRotationRuntime.getPublicRotation = originals.getPublicRotation;
    });
    return {
        batches,
        cache,
        config,
        pool,
        setBuildPool: (builder) => {
            heroRotationRuntime.buildPool = builder;
        },
        getBuildCount: () => buildCount,
        getSaveCount: () => saveCount,
    };
};

test('two simultaneous refresh invocations produce one activation and one idempotent result', async (t) => {
    const harness = installRefreshHarness(t);
    const options = {
        source: 'admin',
        requestedBy: 'admin-1',
        runId: 'release-native-concurrent',
        force: true,
        now: new Date('2026-07-30T00:00:00.000Z'),
    };
    const results = await Promise.all([
        refreshHeroRotation(options),
        refreshHeroRotation(options),
    ]);
    assert.equal(results.filter((result) => result.skipped === false).length, 1);
    assert.equal(results.filter((result) => result.skipped === true).length, 1);
    assert.equal(harness.getBuildCount(), 1);
    assert.equal(harness.getSaveCount(), 1);
    assert.equal(harness.batches.filter((batch) => batch.status === 'active').length, 1);
    assert.equal(harness.batches.find((batch) => batch._id === 'old-active').status, 'retired');
    assert.equal(harness.config.activeBatchId, 'batch-2');
});

test('a due cron invocation rechecks persisted due state after a concurrent manual refresh', async (t) => {
    const harness = installRefreshHarness(t);
    const now = new Date('2026-07-30T00:00:00.000Z');
    const [manual, cron] = await Promise.all([
        refreshHeroRotation({
            source: 'admin',
            requestedBy: 'admin-1',
            runId: 'release-native-manual-race',
            force: true,
            now,
        }),
        refreshHeroRotation({
            source: 'cron',
            requestedBy: 'inngest-cron',
            runId: 'cron:2026-07-30',
            force: false,
            now,
        }),
    ]);

    assert.equal(manual.skipped, false);
    assert.equal(cron.skipped, true);
    assert.equal(cron.reason, 'not-due-after-lock');
    assert.equal(harness.getBuildCount(), 1);
    assert.equal(harness.getSaveCount(), 1);
    assert.equal(harness.batches.filter((batch) => batch.status === 'active').length, 1);
    assert.equal(harness.config.activeBatchId, 'batch-2');
});

test('a permanent pool failure marks only the building batch failed and preserves the old active batch', async (t) => {
    const harness = installRefreshHarness(t);
    harness.setBuildPool(async () => {
        throw new HeroRotationError(
            'HERO_NATIVE_ASSETS_INSUFFICIENT',
            'Fifteen valid assets are required.',
            { status: 409, transient: false },
        );
    });
    await assert.rejects(
        refreshHeroRotation({
            source: 'admin',
            requestedBy: 'admin-1',
            runId: 'release-native-invalid-pool',
            force: true,
            now: new Date('2026-07-30T00:00:00.000Z'),
        }),
        (error) => error.code === 'HERO_NATIVE_ASSETS_INSUFFICIENT' && error.transient === false,
    );
    assert.equal(harness.batches.find((batch) => batch._id === 'old-active').status, 'active');
    assert.equal(harness.batches.find((batch) => batch._id === 'batch-2').status, 'failed');
    assert.equal(harness.config.activeBatchId, 'old-active');
    assert.equal(harness.getSaveCount(), 0);
});

test('retry after a committed activation repairs cache warm without creating or activating a second batch', async (t) => {
    const harness = installRefreshHarness(t, { warmFailures: 1 });
    const options = {
        source: 'admin',
        requestedBy: 'admin-1',
        runId: 'release-native-cache-repair',
        force: true,
        now: new Date('2026-07-30T00:00:00.000Z'),
    };
    await assert.rejects(
        refreshHeroRotation(options),
        (error) => error.code === 'HERO_CACHE_WARM_FAILED' && error.transient === true,
    );
    assert.equal(harness.batches.filter((batch) => batch.status === 'active').length, 1);
    assert.equal(harness.getSaveCount(), 1);

    const retried = await refreshHeroRotation(options);
    assert.equal(retried.skipped, true);
    assert.equal(retried.reason, 'idempotent-after-lock');
    assert.equal(retried.batchId, 'batch-2');
    assert.equal(harness.getBuildCount(), 1);
    assert.equal(harness.getSaveCount(), 1);
});
