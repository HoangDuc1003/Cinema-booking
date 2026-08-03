import test from 'node:test';
import assert from 'node:assert/strict';
import CatalogBatch from '../models/CatalogBatch.js';
import HeroRotationBatch from '../models/HeroRotationBatch.js';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import SiteConfig from '../models/SiteConfig.js';
import { getPublicHomeHero } from '../services/heroService.js';
import { createHeroEtag } from '../services/heroRotationService.js';

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
    runtime: 120,
    genres: [{ id: 1, name: 'Action' }],
    heroVideoId: `hero_trailers/${id}/official`,
    heroVideoMovieId: id,
    heroVideoUrl: `https://res.cloudinary.com/test/video/upload/hero_trailers/${id}/official.mp4`,
    heroVideoMimeType: 'video/mp4',
    heroVideoPosterUrl: `https://res.cloudinary.com/test/image/upload/poster-${id}.jpg`,
    heroVideoStatus: 'ready',
    heroVideoVersion: '1',
    heroVideoDuration: 90,
    heroVideoWidth: 1920,
    heroVideoHeight: 1080,
    heroVideoBytes: 5_000_000,
    heroVideoCodec: 'h264/aac',
    heroVideoVerifiedAt: new Date('2026-07-01T00:00:00Z'),
    heroVideoSource: 'cloudinary',
});

const chain = (value) => ({
    select() {
        return this;
    },
    populate() {
        return this;
    },
    sort() {
        return this;
    },
    limit() {
        return this;
    },
    lean: async () => value,
});

test('active Hero batch is server-authoritative in auto mode, preserves order, and ignores heroOffset', async () => {
    const originals = {
        configFindOne: SiteConfig.findOne,
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        batchFindById: HeroRotationBatch.findById,
        batchFindOne: HeroRotationBatch.findOne,
        movieFind: Movie.find,
    };
    const ids = ['new-1', 'hot-1', 'discovery-1', 'hot-2', 'new-2'];
    const movies = ids.map(nativeMovie).reverse();
    SiteConfig.findOne = () => chain({ heroRotation: { activeBatchId: 'batch-1' } });
    SiteConfig.findOneAndUpdate = () => chain({
        homeHero: {
            mode: 'auto',
            movieIds: ['legacy-1'],
            heroSoundDefaultEnabled: true,
            heroDefaultVolume: 0.35,
        },
        updatedAt: new Date('2026-07-01T00:00:00Z'),
    });
    HeroRotationBatch.findById = () => chain({
        _id: 'batch-1',
        status: 'active',
        batchKey: 'hero-2026-07-01',
        version: 3,
        generatedAt: new Date('2026-07-01T00:00:00Z'),
        activatedAt: new Date('2026-07-01T00:00:00Z'),
        nextRefreshAt: new Date('2026-07-03T00:00:00Z'),
        timezone: 'Asia/Ho_Chi_Minh',
        activeHeroMovieIds: ids,
    });
    HeroRotationBatch.findOne = () => chain(null);
    Movie.find = () => chain(movies);
    try {
        const first = await getPublicHomeHero({ heroOffset: 1 });
        const second = await getPublicHomeHero({ heroOffset: 999 });
        assert.equal(first.movies.length, 5);
        assert.deepEqual(first.movies.map((movie) => movie.id), ids);
        assert.deepEqual(second.movies.map((movie) => movie.id), ids);
        assert.equal(first.settings.effectiveMode, 'auto');
        assert.equal(first.settings.configuredMode, 'auto');
        assert.equal(first.meta.configuredMode, 'auto');
        assert.equal(first.meta.effectiveMode, 'auto');
        assert.equal(first.settings.heroSoundDefaultEnabled, true);
        assert.equal(first.batchId, 'batch-1');
        assert.equal(first.version, 3);
        assert.ok(first.movies.every((movie) => movie.heroVideoSources.length === 1));
        assert.ok(first.movies.every((movie) => !('heroVideoId' in movie)));
    } finally {
        SiteConfig.findOne = originals.configFindOne;
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        HeroRotationBatch.findById = originals.batchFindById;
        HeroRotationBatch.findOne = originals.batchFindOne;
        Movie.find = originals.movieFind;
    }
});

test('R2: manual mode is authoritative, returns exact 5 saved movies in order, retaining native video metadata', async () => {
    const originals = {
        configFindOne: SiteConfig.findOne,
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        batchFindById: HeroRotationBatch.findById,
        batchFindOne: HeroRotationBatch.findOne,
        movieFind: Movie.find,
    };
    const manualIds = ['m-1', 'm-2', 'm-3', 'm-4', 'm-5'];
    const movies = manualIds.map(nativeMovie).reverse();
    SiteConfig.findOne = () => chain({ heroRotation: { activeBatchId: 'batch-1' } });
    SiteConfig.findOneAndUpdate = () => chain({
        homeHero: {
            mode: 'manual',
            movieIds: manualIds,
            heroSoundDefaultEnabled: true,
            heroDefaultVolume: 0.35,
        },
        updatedAt: new Date('2026-07-01T00:00:00Z'),
    });
    HeroRotationBatch.findById = () => chain({
        _id: 'batch-1',
        status: 'active',
        batchKey: 'hero-2026-07-01',
        version: 3,
        activeHeroMovieIds: ['auto-1', 'auto-2', 'auto-3', 'auto-4', 'auto-5'],
    });
    Movie.find = () => chain(movies);
    try {
        const payload = await getPublicHomeHero();
        assert.equal(payload.settings.configuredMode, 'manual');
        assert.equal(payload.settings.effectiveMode, 'manual');
        assert.equal(payload.meta.configuredMode, 'manual');
        assert.equal(payload.meta.effectiveMode, 'manual');
        assert.equal(payload.meta.source, 'manual-selection');
        assert.deepEqual(payload.movies.map((m) => m.id), manualIds);
        assert.ok(payload.movies.every((m) => m.heroVideoStatus === 'ready'));
        assert.ok(payload.movies.every((m) => m.heroVideoUrl.includes('.mp4')));
    } finally {
        SiteConfig.findOne = originals.configFindOne;
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        HeroRotationBatch.findById = originals.batchFindById;
        Movie.find = originals.movieFind;
    }
});

test('missing active batch returns five ordered posters and never exposes mock/generic media as playable', async () => {
    const originals = {
        configFindOne: SiteConfig.findOne,
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        batchFindOne: HeroRotationBatch.findOne,
        movieFind: Movie.find,
    };
    const ids = ['legacy-3', 'legacy-1', 'legacy-5', 'legacy-2', 'legacy-4'];
    const movies = ids.map((id) => ({
        ...nativeMovie(id),
        heroVideoUrl: '/mock/hero-trailer.mp4',
        heroVideoId: 'hero_trailers/cinematic_universal_loop_1',
    })).reverse();
    SiteConfig.findOne = () => chain(null);
    SiteConfig.findOneAndUpdate = () => chain({
        homeHero: {
            mode: 'auto',
            movieIds: ids,
            heroSoundDefaultEnabled: false,
            heroDefaultVolume: 0.35,
        },
        updatedAt: new Date('2026-07-01T00:00:00Z'),
    });
    HeroRotationBatch.findOne = () => chain(null);
    Movie.find = () => chain(movies);
    try {
        const payload = await getPublicHomeHero({ now: new Date('2026-07-02T00:00:00+07:00') });
        assert.equal(payload.cache, 'fallback');
        assert.equal(payload.settings.effectiveMode, 'poster-only');
        assert.deepEqual(payload.movies.map((movie) => movie.id), ids);
        assert.ok(payload.movies.every((movie) => movie.heroVideoUrl === ''));
        assert.ok(payload.movies.every((movie) => movie.heroVideoSources.length === 0));
        assert.ok(payload.movies.every((movie) => movie.heroVideoStatus === 'poster-only'));
    } finally {
        SiteConfig.findOne = originals.configFindOne;
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        HeroRotationBatch.findOne = originals.batchFindOne;
        Movie.find = originals.movieFind;
    }
});

test('semantic Hero ETag changes for movie order, video version, and sound settings', () => {
    const base = {
        batchId: 'batch-1',
        version: 1,
        movies: [
            { id: 'a', heroVideoVersion: '1' },
            { id: 'b', heroVideoVersion: '1' },
        ],
        settings: {
            heroSoundDefaultEnabled: false,
            heroDefaultVolume: 0.35,
            updatedAt: '2026-07-01T00:00:00Z',
        },
    };
    const original = createHeroEtag(base);
    assert.notEqual(createHeroEtag({ ...base, movies: [...base.movies].reverse() }), original);
    assert.notEqual(createHeroEtag({
        ...base,
        movies: [{ id: 'a', heroVideoVersion: '2' }, base.movies[1]],
    }), original);
    assert.notEqual(createHeroEtag({
        ...base,
        settings: { ...base.settings, heroSoundDefaultEnabled: true },
    }), original);
});

test('R2: getAdminHomeHero populates selectedMovies using saved settings.movieIds without forcing poster-only strip', async () => {
    const originals = {
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        configFindOne: SiteConfig.findOne,
        batchFindOne: HeroRotationBatch.findOne,
        batchFind: HeroRotationBatch.find,
        catalogFindOne: CatalogBatch.findOne,
        movieFind: Movie.find,
        showFind: Show.find,
    };
    const savedIds = ['m-1', 'm-2', 'm-3', 'm-4', 'm-5'];
    const movies = savedIds.map(nativeMovie);
    SiteConfig.findOneAndUpdate = () => chain({
        homeHero: {
            mode: 'manual',
            movieIds: savedIds,
            heroSoundDefaultEnabled: false,
            heroDefaultVolume: 0.35,
        },
        updatedAt: new Date('2026-07-01T00:00:00Z'),
    });
    SiteConfig.findOne = () => chain(null);
    HeroRotationBatch.findOne = () => chain(null);
    HeroRotationBatch.find = () => chain([]);
    CatalogBatch.findOne = () => chain(null);
    Show.find = () => chain([]);
    Movie.find = () => chain(movies);
    try {
        const { getAdminHomeHero } = await import('../services/heroService.js');
        const adminHero = await getAdminHomeHero();
        assert.deepEqual(adminHero.selectedMovies.map((m) => m.id), savedIds);
        assert.ok(adminHero.selectedMovies.every((m) => m.heroVideoStatus === 'ready'));
        assert.ok(adminHero.selectedMovies.every((m) => m.heroVideoUrl.includes('.mp4')));
    } finally {
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        SiteConfig.findOne = originals.configFindOne;
        HeroRotationBatch.findOne = originals.batchFindOne;
        HeroRotationBatch.find = originals.batchFind;
        CatalogBatch.findOne = originals.catalogFindOne;
        Show.find = originals.showFind;
        Movie.find = originals.movieFind;
    }
});

test('R3: updateHomeHero in manual mode enforces 5 unique native-ready movies with HTTP 422 and preserves SiteConfig atomically on failure', async () => {
    const originals = {
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        configFindOne: SiteConfig.findOne,
        configUpdateOne: SiteConfig.updateOne,
        batchFindById: HeroRotationBatch.findById,
        movieFind: Movie.find,
    };
    let updateCalled = false;
    SiteConfig.findOneAndUpdate = () => {
        updateCalled = true;
        return chain({
            homeHero: {
                mode: 'manual',
                movieIds: ['m-1', 'm-2', 'm-3', 'm-4', 'm-5'],
                heroSoundDefaultEnabled: false,
                heroDefaultVolume: 0.35,
            },
            updatedAt: new Date('2026-07-01T00:00:00Z'),
        });
    };
    SiteConfig.findOne = () => chain({ heroRotation: { activeBatchId: 'batch-1' } });
    SiteConfig.updateOne = async () => ({ modifiedCount: 1 });
    HeroRotationBatch.findById = () => chain({
        _id: 'batch-1',
        status: 'active',
        batchKey: 'hero-2026-07-01',
        version: 1,
        activeHeroMovieIds: ['m-1', 'm-2', 'm-3', 'm-4', 'm-5'],
    });

    const validMovies = ['m-1', 'm-2', 'm-3', 'm-4', 'm-5'].map(nativeMovie);
    Movie.find = () => chain(validMovies);

    try {
        const { updateHomeHero } = await import('../services/heroService.js');

        // Test 1: Fewer than 5 unique IDs throws HTTP 422
        updateCalled = false;
        await assert.rejects(
            updateHomeHero({ mode: 'manual', movieIds: ['m-1', 'm-2', 'm-3', 'm-4'] }),
            (error) => (error.status === 422 || error.statusCode === 422),
        );
        assert.equal(updateCalled, false, 'SiteConfig must remain untouched when validation fails');

        // Test 2: Non-unique IDs (e.g. 5 IDs with 1 duplicate) throws HTTP 422
        updateCalled = false;
        await assert.rejects(
            updateHomeHero({ mode: 'manual', movieIds: ['m-1', 'm-1', 'm-2', 'm-3', 'm-4'] }),
            (error) => (error.status === 422 || error.statusCode === 422),
        );
        assert.equal(updateCalled, false, 'SiteConfig must remain untouched when validation fails');

        // Test 3: Missing movie in DB throws HTTP 422
        updateCalled = false;
        Movie.find = () => chain(validMovies.slice(0, 4));
        await assert.rejects(
            updateHomeHero({ mode: 'manual', movieIds: ['m-1', 'm-2', 'm-3', 'm-4', 'm-5'] }),
            (error) => (error.status === 422 || error.statusCode === 422),
        );
        assert.equal(updateCalled, false, 'SiteConfig must remain untouched when validation fails');

        // Test 4: Movie with heroVideoStatus !== 'ready' throws HTTP 422
        updateCalled = false;
        const unreadyMovies = validMovies.map((m, idx) => (idx === 0 ? { ...m, heroVideoStatus: 'missing' } : m));
        Movie.find = () => chain(unreadyMovies);
        await assert.rejects(
            updateHomeHero({ mode: 'manual', movieIds: ['m-1', 'm-2', 'm-3', 'm-4', 'm-5'] }),
            (error) => (error.status === 422 || error.statusCode === 422),
        );
        assert.equal(updateCalled, false, 'SiteConfig must remain untouched when validation fails');

        // Test 5: Valid manual selection succeeds, calls SiteConfig update, pre-warms cache, and returns effective payload
        updateCalled = false;
        Movie.find = () => chain(validMovies);
        const result = await updateHomeHero({ mode: 'manual', movieIds: ['m-1', 'm-2', 'm-3', 'm-4', 'm-5'] });
        assert.equal(updateCalled, true, 'SiteConfig should be updated on valid manual selection');
        assert.equal(result.mode, 'manual');
        assert.ok(Array.isArray(result.movies));
        assert.equal(result.movies.length, 5);
        assert.ok(result.meta);
        assert.equal(result.meta.configuredMode, 'manual');
    } finally {
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        SiteConfig.findOne = originals.configFindOne;
        SiteConfig.updateOne = originals.configUpdateOne;
        HeroRotationBatch.findById = originals.batchFindById;
        Movie.find = originals.movieFind;
    }
});

test('R3/R4: getAdminHomeHero returns liveMovies and manualSelection in response object', async () => {
    const originals = {
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        configFindOne: SiteConfig.findOne,
        batchFindOne: HeroRotationBatch.findOne,
        batchFind: HeroRotationBatch.find,
        catalogFindOne: CatalogBatch.findOne,
        movieFind: Movie.find,
        showFind: Show.find,
    };
    const savedIds = ['m-1', 'm-2', 'm-3', 'm-4', 'm-5'];
    const movies = savedIds.map(nativeMovie);
    SiteConfig.findOneAndUpdate = () => chain({
        homeHero: {
            mode: 'manual',
            movieIds: savedIds,
            heroSoundDefaultEnabled: false,
            heroDefaultVolume: 0.35,
        },
        updatedAt: new Date('2026-07-01T00:00:00Z'),
    });
    SiteConfig.findOne = () => chain(null);
    HeroRotationBatch.findOne = () => chain(null);
    HeroRotationBatch.find = () => chain([]);
    CatalogBatch.findOne = () => chain(null);
    Show.find = () => chain([]);
    Movie.find = () => chain(movies);

    try {
        const { getAdminHomeHero } = await import('../services/heroService.js');
        const adminHero = await getAdminHomeHero();
        assert.ok(Array.isArray(adminHero.liveMovies));
        assert.ok(adminHero.manualSelection);
        assert.deepEqual(adminHero.manualSelection.movieIds, savedIds);
        assert.ok(Array.isArray(adminHero.manualSelection.movies));
        assert.equal(adminHero.manualSelection.movies.length, 5);
        assert.ok(adminHero.rotation);
        assert.ok(adminHero.settings);
        assert.ok(adminHero.selectedMovies);
        assert.ok(adminHero.availableMovies);
    } finally {
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        SiteConfig.findOne = originals.configFindOne;
        HeroRotationBatch.findOne = originals.batchFindOne;
        HeroRotationBatch.find = originals.batchFind;
        CatalogBatch.findOne = originals.catalogFindOne;
        Show.find = originals.showFind;
        Movie.find = originals.movieFind;
    }
});
