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
