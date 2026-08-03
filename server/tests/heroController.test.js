import test from 'node:test';
import assert from 'node:assert/strict';
import adminRouter from '../routes/adminRoutes.js';
import { createGetHomeHeroHandler } from '../controllers/showController.js';

const createResponse = () => ({
    headers: {},
    statusCode: 200,
    body: undefined,
    ended: false,
    set(name, value) {
        this.headers[name] = value;
        return this;
    },
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(value) {
        this.body = value;
        return this;
    },
    end() {
        this.ended = true;
        return this;
    },
});

const payload = {
    version: 4,
    batchId: 'batch-4',
    batchKey: 'hero-2026-07-29',
    generatedAt: '2026-07-29T00:00:00.000Z',
    nextRefreshAt: '2026-07-31T17:00:00.000Z',
    timezone: 'Asia/Ho_Chi_Minh',
    settings: {
        heroSoundDefaultEnabled: false,
        heroDefaultVolume: 0.35,
    },
    movies: Array.from({ length: 5 }, (_, index) => ({ id: String(index + 1) })),
    rotation: { poolSize: 15, batchSize: 5 },
    meta: {
        configuredMode: 'auto',
        effectiveMode: 'auto',
        source: 'auto-rotation',
        version: 4,
        buildSha: 'dev-local',
        deploymentId: 'local-dev',
        environment: 'development',
    },
    cache: 'hit',
};

test('Home Hero controller returns cache headers, stable metadata, meta identity, and five server-ordered movies', async () => {
    const handler = createGetHomeHeroHandler({
        loadHero: async () => payload,
        makeEtag: () => '"hero-controller-test"',
    });
    const req = { get: () => undefined };
    const res = createResponse();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers.ETag, '"hero-controller-test"');
    assert.equal(res.headers['X-Cache'], 'hit');
    assert.match(res.headers['Cache-Control'], /stale-while-revalidate/);
    assert.equal(res.headers.Vary, 'Origin');
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.movies, payload.movies);
    assert.equal(res.body.nextRefreshAt, payload.nextRefreshAt);
    assert.deepEqual(res.body.meta, payload.meta);
    assert.equal(res.body.meta.configuredMode, 'auto');
    assert.equal(res.body.meta.effectiveMode, 'auto');
    assert.equal(res.body.meta.source, 'auto-rotation');
});

test('Home Hero controller returns 304 without a response body for a matching ETag', async () => {
    const handler = createGetHomeHeroHandler({
        loadHero: async () => payload,
        makeEtag: () => '"hero-controller-test"',
        etagMatches: (candidate, etag) => candidate === etag,
    });
    const req = { get: () => '"hero-controller-test"' };
    const res = createResponse();
    await handler(req, res);

    assert.equal(res.statusCode, 304);
    assert.equal(res.ended, true);
    assert.equal(res.body, undefined);
    assert.equal(res.headers.ETag, '"hero-controller-test"');
});

test('every Hero admin route applies protectAdmin before its action handler', () => {
    const heroLayers = adminRouter.stack.filter((layer) => layer.route?.path?.startsWith('/hero'));
    assert.equal(heroLayers.length, 8);
    for (const layer of heroLayers) {
        assert.equal(layer.route.stack[0]?.handle?.name, 'protectAdmin', layer.route.path);
        assert.ok(layer.route.stack.length >= 2, layer.route.path);
    }
});

test('updateHeroSettings controller action returns settings, liveHero, and meta on success', async () => {
    const { updateHeroSettings } = await import('../controllers/adminController.js');
    const SiteConfig = (await import('../models/SiteConfig.js')).default;
    const Movie = (await import('../models/Movie.js')).default;
    const chain = (value) => ({
        select: () => chain(value),
        populate: () => chain(value),
        sort: () => chain(value),
        limit: () => chain(value),
        lean: async () => value,
    });
    const originals = {
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        configFindOne: SiteConfig.findOne,
        configUpdateOne: SiteConfig.updateOne,
        movieFind: Movie.find,
    };
    const validMovies = ['m-1', 'm-2', 'm-3', 'm-4', 'm-5'].map((id) => ({
        _id: id,
        title: `Movie ${id}`,
        poster_path: `/p-${id}.jpg`,
        backdrop_path: `/b-${id}.jpg`,
        release_date: '2026-07-01',
        vote_average: 8,
        vote_count: 100,
        popularity: 50,
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
    }));
    SiteConfig.findOneAndUpdate = () => chain({
        homeHero: {
            mode: 'manual',
            movieIds: ['m-1', 'm-2', 'm-3', 'm-4', 'm-5'],
            heroSoundDefaultEnabled: false,
            heroDefaultVolume: 0.35,
        },
        updatedAt: new Date('2026-07-01T00:00:00Z'),
    });
    SiteConfig.findOne = () => chain(null);
    SiteConfig.updateOne = async () => ({ modifiedCount: 1 });
    Movie.find = () => chain(validMovies);

    try {
        const req = { body: { mode: 'manual', movieIds: ['m-1', 'm-2', 'm-3', 'm-4', 'm-5'] } };
        const res = createResponse();
        await updateHeroSettings(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.message, 'Hero updated successfully.');
        assert.ok(res.body.settings);
        assert.ok(res.body.liveHero);
        assert.ok(res.body.meta);
        assert.equal(res.body.settings.configuredMode, 'manual');
    } finally {
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        SiteConfig.findOne = originals.configFindOne;
        SiteConfig.updateOne = originals.configUpdateOne;
        Movie.find = originals.movieFind;
    }
});

test('updateHeroSettings controller action returns 422 with code MANUAL_HERO_INVALID and invalidMovies on failure', async () => {
    const { updateHeroSettings } = await import('../controllers/adminController.js');
    const SiteConfig = (await import('../models/SiteConfig.js')).default;
    const Movie = (await import('../models/Movie.js')).default;
    const chain = (value) => ({
        select: () => chain(value),
        populate: () => chain(value),
        sort: () => chain(value),
        limit: () => chain(value),
        lean: async () => value,
    });
    const originals = {
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        movieFind: Movie.find,
    };
    SiteConfig.findOneAndUpdate = () => {
        assert.fail('SiteConfig should not be updated on validation error');
    };
    Movie.find = () => chain([]);

    try {
        const req = { body: { mode: 'manual', movieIds: ['m-1', 'm-2', 'm-3', 'm-4', 'm-5'] } };
        const res = createResponse();
        await updateHeroSettings(req, res);
        assert.equal(res.statusCode, 422);
        assert.equal(res.body.success, false);
        assert.equal(res.body.code, 'MANUAL_HERO_INVALID');
        assert.equal(res.body.message, 'All five Manual Hero movies require verified native trailers.');
        assert.ok(Array.isArray(res.body.invalidMovies));
    } finally {
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        Movie.find = originals.movieFind;
    }
});

