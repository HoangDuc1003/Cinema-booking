import test from 'node:test';
import assert from 'node:assert/strict';
import HeroRotationBatch from '../models/HeroRotationBatch.js';
import Movie from '../models/Movie.js';
import SiteConfig from '../models/SiteConfig.js';
import {
    assertHeroPoolAssetsReady,
    getHeroBatchActivationGuard,
    getHeroPoolReadiness,
    heroRotationRuntime,
    reconcilePreparingHeroBatches,
    validateRegisteredHeroMediaAsset,
} from '../services/heroRotationService.js';
import {
    registeredHeroAssetForMovie,
    registeredHeroAssetsForMovies,
} from './heroMediaTestFixtures.js';

const chain = (value) => ({
    select() { return this; },
    sort() { return this; },
    session() { return this; },
    lean: async () => value,
});

const nativeMovie = (id) => ({
    _id: id,
    title: `Movie ${id}`,
    poster_path: `/poster-${id}.jpg`,
    backdrop_path: `/backdrop-${id}.jpg`,
    release_date: '2026-08-01',
    adult: false,
    heroVideoId: `hero_trailers/${id}/official`,
    heroVideoMovieId: id,
    heroVideoUrl: `https://res.cloudinary.com/test/video/upload/hero_trailers/${id}/official.mp4`,
    heroVideoMimeType: 'video/mp4',
    heroVideoPosterUrl: `https://res.cloudinary.com/test/image/upload/${id}.jpg`,
    heroVideoStatus: 'ready',
    heroVideoVersion: '1',
    heroVideoDuration: 90,
    heroVideoWidth: 1920,
    heroVideoHeight: 1080,
    heroVideoBytes: 5_000_000,
    heroVideoCodec: 'h264/aac',
    heroVideoVerifiedAt: new Date('2026-08-01T00:00:00Z'),
});

const groups = {
    newestMovieIds: Array.from({ length: 5 }, (_, index) => `new-${index}`),
    hotMovieIds: Array.from({ length: 5 }, (_, index) => `hot-${index}`),
    discoveryMovieIds: Array.from({ length: 5 }, (_, index) => `discovery-${index}`),
};

const movieIds = Object.values(groups).flat();
const movies = movieIds.map(nativeMovie);

test('activation registry validation requires verified binding and approved rights', () => {
    const movie = nativeMovie('movie-1');
    assert.equal(validateRegisteredHeroMediaAsset({
        movie,
        asset: registeredHeroAssetForMovie(movie),
    }).valid, true);

    const rejected = validateRegisteredHeroMediaAsset({
        movie,
        asset: registeredHeroAssetForMovie(movie, {
            rights: { status: 'UNKNOWN' },
            secureUrl: 'https://res.cloudinary.com/test/video/upload/other.mp4',
        }),
    });
    assert.equal(rejected.valid, false);
    assert.ok(rejected.reasons.includes('registry-rights-not-approved'));
    assert.ok(rejected.reasons.includes('registry-url-mismatch'));
});

test('15 Movie projections cannot activate when one registry asset is unapproved', () => {
    const assets = registeredHeroAssetsForMovies(movies);
    assets[14] = { ...assets[14], rights: { status: 'UNKNOWN' } };
    const readiness = getHeroPoolReadiness({
        pool: { ...groups, movieIds },
        movies,
        mediaAssets: assets,
    });

    assert.equal(readiness.complete, false);
    assert.equal(readiness.readyCount, 14);
    assert.equal(readiness.categoryCounts.discovery, 4);
    assert.ok(readiness.invalid[0].reasons.includes('registry-rights-not-approved'));
    assert.throws(
        () => assertHeroPoolAssetsReady({ movies, expectedMovieIds: movieIds, mediaAssets: assets }),
        (error) => error.code === 'HERO_POOL_ASSETS_CHANGED'
            && error.details.invalid.some((item) => (
                item.movieId === 'discovery-4'
                && item.reasons.includes('registry-rights-not-approved')
            )),
    );
});

test('activation guard rejects a stale predecessor, lower version, and consumed fence', () => {
    const guard = getHeroBatchActivationGuard({
        batch: {
            _id: 'stale-v2',
            previousBatchId: 'v1',
            version: 2,
            fencingToken: 2,
        },
        activeBatch: { _id: 'newer-v3', version: 3 },
        config: {
            heroRotation: {
                activeBatchId: 'newer-v3',
                lastFencingToken: 3,
            },
        },
    });

    assert.equal(guard.valid, false);
    assert.deepEqual(guard.reasons, [
        'previous-batch-mismatch',
        'version-not-newer',
        'stale-fencing-token',
    ]);
});

test('reconciliation fails stale v2 instead of replacing active v3', async (t) => {
    const stale = {
        _id: 'stale-v2',
        status: 'ready_to_activate',
        batchKey: 'v2',
        version: 2,
        fencingToken: 2,
        previousBatchId: 'v1',
        ...groups,
        movieIds,
        activeHeroMovieIds: movieIds.slice(0, 5),
    };
    const active = { _id: 'newer-v3', status: 'active', version: 3, fencingToken: 3 };
    const originals = {
        batchFind: HeroRotationBatch.find,
        batchFindOne: HeroRotationBatch.findOne,
        batchUpdateOne: HeroRotationBatch.updateOne,
        movieFind: Movie.find,
        configFindOne: SiteConfig.findOne,
        loadReadyMediaAssets: heroRotationRuntime.loadReadyMediaAssets,
        startSession: heroRotationRuntime.startSession,
    };
    let failedUpdate = null;
    HeroRotationBatch.find = () => chain([stale]);
    HeroRotationBatch.findOne = () => chain(active);
    HeroRotationBatch.updateOne = async (_filter, update) => {
        failedUpdate = update;
        return { modifiedCount: 1 };
    };
    Movie.find = () => chain(movies);
    SiteConfig.findOne = () => chain({
        heroRotation: { activeBatchId: active._id, lastFencingToken: 3 },
    });
    heroRotationRuntime.loadReadyMediaAssets = async () => registeredHeroAssetsForMovies(movies);
    heroRotationRuntime.startSession = async () => assert.fail('stale batch must not open a transaction');
    t.after(() => {
        HeroRotationBatch.find = originals.batchFind;
        HeroRotationBatch.findOne = originals.batchFindOne;
        HeroRotationBatch.updateOne = originals.batchUpdateOne;
        Movie.find = originals.movieFind;
        SiteConfig.findOne = originals.configFindOne;
        heroRotationRuntime.loadReadyMediaAssets = originals.loadReadyMediaAssets;
        heroRotationRuntime.startSession = originals.startSession;
    });

    const result = await reconcilePreparingHeroBatches({ now: new Date('2026-08-08T00:00:00Z') });

    assert.equal(result.status, 'STALE_PREPARING_BATCH');
    assert.equal(result.activated, false);
    assert.equal(failedUpdate.$set.status, 'failed');
    assert.equal(failedUpdate.$set.failureReason, 'SUPERSEDED_PREPARING_BATCH');
});

test('zero registered assets remains a healthy 0/15 preparing state', () => {
    const readiness = getHeroPoolReadiness({
        pool: { ...groups, movieIds },
        movies,
        mediaAssets: [],
    });
    assert.equal(readiness.status, 'DEGRADED');
    assert.equal(readiness.complete, false);
    assert.equal(readiness.readyCount, 0);
    assert.deepEqual(readiness.categoryCounts, { newest: 0, hot: 0, discovery: 0 });
});
