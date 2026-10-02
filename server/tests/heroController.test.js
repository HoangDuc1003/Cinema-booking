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
    version: 'auto:2026-07-29T00:00:initial',
    batchId: 'poster-2026-07-29T00:00',
    batchKey: '2026-07-29T00:00',
    generatedAt: '2026-07-29T00:00:00.000Z',
    nextRefreshAt: '2026-07-29T05:00:00.000Z',
    timezone: 'Asia/Ho_Chi_Minh',
    dateKey: '2026-07-29',
    settings: { mode: 'auto', configuredMode: 'auto', effectiveMode: 'auto', movieIds: [] },
    movies: Array.from({ length: 5 }, (_, index) => ({ id: String(index + 1) })),
    rotation: { type: 'poster-rotation', key: '2026-07-29T00:00', hours: 12, dateKey: '2026-07-29', seed: 'hero:2026-07-29T00:00:default' },
    meta: {
        configuredMode: 'auto',
        effectiveMode: 'auto',
        source: 'poster-rotation',
        dateKey: '2026-07-29',
        rotationKey: '2026-07-29T00:00',
        seed: 'hero:2026-07-29T00:00:default',
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
    assert.equal(res.body.meta.source, 'poster-rotation');
});

test('Home Hero controller serves the same English text and ETag to every country', async () => {
    const handler = createGetHomeHeroHandler({
        loadHero: async () => payload,
        makeEtag: () => '"hero-controller-test"',
    });
    const countryGet = (country) => (name) => (name.toLowerCase() === 'x-vercel-ip-country' ? country : undefined);
    const vietnam = createResponse();
    await handler({ get: countryGet('VN') }, vietnam);
    const japan = createResponse();
    await handler({ get: countryGet('JP') }, japan);

    for (const res of [vietnam, japan]) {
        assert.equal(res.headers.ETag, '"hero-controller-test"');
        assert.equal(res.headers['Content-Language'], 'en-US');
        assert.deepEqual(res.body.movies, payload.movies);
    }
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
    // GET /hero, PUT /hero, POST /hero/randomize — the poster-only surface.
    assert.equal(heroLayers.length, 3);
    for (const layer of heroLayers) {
        assert.equal(layer.route.stack[0]?.handle?.name, 'protectAdmin', layer.route.path);
        assert.ok(layer.route.stack.length >= 2, layer.route.path);
    }
});

test('updateHeroSettings returns settings, liveHero, and meta on success', async () => {
    const { updateHeroSettings } = await import('../controllers/adminController.js');
    const SiteConfig = (await import('../models/SiteConfig.js')).default;
    const Movie = (await import('../models/Movie.js')).default;
    const Show = (await import('../models/Show.js')).default;
    const chain = (value) => ({
        select: () => chain(value),
        populate: () => chain(value),
        sort: () => chain(value),
        limit: () => chain(value),
        lean: async () => value,
    });
    const movieIds = ['m-1', 'm-2', 'm-3', 'm-4', 'm-5'];
    const movies = movieIds.map((id) => ({
        _id: id,
        title: `Movie ${id}`,
        poster_path: `/p-${id}.jpg`,
        backdrop_path: `/b-${id}.jpg`,
        release_date: '2026-07-01',
        vote_average: 8,
        runtime: 100,
        genres: [{ id: 28, name: 'Action' }],
    }));
    const storedConfig = {
        homeHero: { mode: 'manual', movieIds },
        updatedAt: new Date('2026-07-01T00:00:00Z'),
    };
    const originals = {
        configFindOne: SiteConfig.findOne,
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        movieFind: Movie.find,
        showFind: Show.find,
    };
    // getHomeHeroConfig reads before it writes, so both paths need a stub.
    SiteConfig.findOne = () => chain(storedConfig);
    SiteConfig.findOneAndUpdate = () => chain(storedConfig);
    Movie.find = () => chain(movies);
    Show.find = () => chain([]);

    try {
        const req = { body: { mode: 'manual', movieIds } };
        const res = createResponse();
        await updateHeroSettings(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.ok(res.body.settings);
        assert.ok(res.body.liveHero);
        assert.ok(res.body.meta);
        assert.equal(res.body.settings.configuredMode, 'manual');
        assert.equal(res.body.liveHero.movies.length, 5);
        assert.deepEqual(res.body.liveHero.movies.map((movie) => movie.id), movieIds);
    } finally {
        SiteConfig.findOne = originals.configFindOne;
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        Movie.find = originals.movieFind;
        Show.find = originals.showFind;
    }
});

test('updateHeroSettings returns 400 MANUAL_HERO_INVALID and never writes SiteConfig on validation failure', async () => {
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
        assert.fail('SiteConfig must not be updated when the selection is invalid');
    };
    // No stored movie matches the requested IDs.
    Movie.find = () => chain([]);

    try {
        const req = { body: { mode: 'manual', movieIds: ['m-1', 'm-2', 'm-3', 'm-4', 'm-5'] } };
        const res = createResponse();
        await updateHeroSettings(req, res);
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.success, false);
        assert.equal(res.body.code, 'MANUAL_HERO_INVALID');
        assert.deepEqual(res.body.invalidMovies, ['m-1', 'm-2', 'm-3', 'm-4', 'm-5']);
    } finally {
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        Movie.find = originals.movieFind;
    }
});
