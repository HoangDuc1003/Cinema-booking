import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    createHomeNowShowingService,
    normalizeHomeNowShowingMovie,
    normalizeHomeNowShowingRegion,
    parseHomeNowShowingLimit,
    rankHomeNowShowingMovies,
} from '../services/homeNowShowingService.js';
import { redisKeys } from '../services/redisKeys.js';
import { createGetHomeNowShowingHandler } from '../controllers/showController.js';

const movie = (id, popularity, overrides = {}) => ({
    id,
    title: `Movie ${id}`,
    poster_path: `/poster-${id}.jpg`,
    backdrop_path: `/backdrop-${id}.jpg`,
    release_date: '2026-08-01',
    popularity,
    vote_count: id * 10,
    vote_average: 7,
    adult: false,
    ...overrides,
});

const createMemoryCache = (entries = []) => {
    const values = new Map(entries);
    const writes = [];
    return {
        values,
        writes,
        readCache: async (key) => values.get(key) ?? null,
        writeCache: async (key, value, ttl) => {
            values.set(key, value);
            writes.push({ key, value, ttl });
            return true;
        },
    };
};

const createResponse = () => ({
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
});

test('home now-showing query inputs are bounded and VN-only', () => {
    assert.equal(parseHomeNowShowingLimit(undefined), 10);
    assert.equal(parseHomeNowShowingLimit(0), 1);
    assert.equal(parseHomeNowShowingLimit(200), 20);
    assert.equal(normalizeHomeNowShowingRegion('vn'), 'VN');
    assert.equal(normalizeHomeNowShowingRegion('invalid'), 'VN');
    assert.equal(normalizeHomeNowShowingRegion('us'), 'VN');
});

test('normalization rejects invalid, adult, image-less, and metadata-poor candidates', () => {
    assert.equal(normalizeHomeNowShowingMovie(movie(1, 2, { adult: true })), null);
    assert.equal(normalizeHomeNowShowingMovie(movie('bad', 2)), null);
    assert.equal(normalizeHomeNowShowingMovie(movie(2, 2, { title: '', name: '' })), null);
    assert.equal(normalizeHomeNowShowingMovie(movie(3, 2, { poster_path: '', backdrop_path: '' })), null);
    assert.equal(normalizeHomeNowShowingMovie(movie(4, 2, { release_date: '' })), null);
    assert.equal(normalizeHomeNowShowingMovie(movie(5, 2))._id, '5');
});

test('ranking filters before truncation, de-duplicates IDs, and returns numeric popularity top ten', () => {
    const input = [
        ...Array.from({ length: 14 }, (_, index) => movie(index + 1, String((index + 1) * 10))),
        movie(14, 999),
        movie(99, 1000, { adult: true }),
        movie(98, 990, { poster_path: '', backdrop_path: '' }),
    ];
    const ranked = rankHomeNowShowingMovies(input, 10);

    assert.equal(ranked.length, 10);
    assert.deepEqual(ranked.map((entry) => entry.id), [14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
    assert.deepEqual(ranked.map((entry) => entry.popularity), [999, 130, 120, 110, 100, 90, 80, 70, 60, 50]);
});

test('empty Show storage cannot make Home fail when TMDB now-playing has ten valid movies', async () => {
    const cache = createMemoryCache();
    const fetchCalls = [];
    const loadHome = createHomeNowShowingService({
        ...cache,
        fetchJson: async (path, params) => {
            fetchCalls.push({ path, params });
            return {
                results: params.page === 1
                    ? Array.from({ length: 12 }, (_, index) => movie(index + 1, 100 - index))
                    : [],
            };
        },
    });
    const handler = createGetHomeNowShowingHandler({
        loadHome,
        makeEtag: () => '"test"',
        etagMatches: () => false,
    });
    const res = createResponse();

    await handler({ query: { limit: '10' }, get: () => '' }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.results.length, 10);
    assert.equal(res.body.data.meta.source, 'tmdb-now-playing');
    assert.equal(res.body.data.meta.region, 'VN');
    assert.deepEqual(fetchCalls.map((call) => call.params.page), [1, 2]);
    assert.equal(fetchCalls.every((call) => call.path === '/movie/now_playing'), true);
});

test('fresh Home cache returns requested movies without any TMDB request or cache rewrite', async () => {
    const cached = {
        results: Array.from({ length: 12 }, (_, index) => movie(index + 1, 100 - index)),
        generatedAt: '2026-08-08T00:00:00.000Z',
        fetchedPages: 2,
    };
    const cache = createMemoryCache([
        [redisKeys.homeTmdbNowPlaying('VN'), cached],
    ]);
    let fetches = 0;
    const loadHome = createHomeNowShowingService({
        ...cache,
        fetchJson: async () => {
            fetches += 1;
            throw new Error('fresh cache must prevent this request');
        },
    });

    const result = await loadHome({ limit: 10, now: new Date('2026-08-09T00:00:00.000Z') });

    assert.equal(result.cache, 'hit');
    assert.equal(result.value.results.length, 10);
    assert.equal(result.value.meta.source, 'tmdb-now-playing');
    assert.equal(result.value.meta.stale, false);
    assert.equal(fetches, 0);
    assert.equal(cache.writes.length, 0);
});

test('page-one failure cannot promote successful page-two results over Home last-good', async () => {
    const cached = {
        results: Array.from({ length: 10 }, (_, index) => movie(index + 1, 100 - index)),
        generatedAt: '2026-08-08T00:00:00.000Z',
        fetchedPages: 2,
    };
    const cache = createMemoryCache([
        [redisKeys.homeTmdbNowPlayingLastGood('VN'), cached],
    ]);
    const fetchCalls = [];
    const loadHome = createHomeNowShowingService({
        ...cache,
        fetchJson: async (_path, params) => {
            fetchCalls.push(params.page);
            if (params.page === 1) throw new Error('page one unavailable');
            return { results: Array.from({ length: 10 }, (_, index) => movie(100 + index, 1000 - index)) };
        },
    });

    const result = await loadHome({ limit: 10, now: new Date('2026-08-09T00:00:00.000Z') });

    assert.deepEqual(fetchCalls, [1, 2]);
    assert.equal(result.cache, 'stale');
    assert.equal(result.value.meta.stale, true);
    assert.deepEqual(result.value.results.map((entry) => entry.id), cached.results.map((entry) => entry.id));
    assert.equal(cache.writes.length, 0);
});

test('page-one failure with successful page two and no last-good remains unavailable', async () => {
    const cache = createMemoryCache();
    const loadHome = createHomeNowShowingService({
        ...cache,
        fetchJson: async (_path, params) => {
            if (params.page === 1) throw new Error('page one unavailable');
            return { results: Array.from({ length: 10 }, (_, index) => movie(100 + index, 1000 - index)) };
        },
    });

    await assert.rejects(
        loadHome({ limit: 10 }),
        (error) => error.code === 'TMDB_UNAVAILABLE' && error.statusCode === 503,
    );
    assert.equal(cache.writes.length, 0);
});

test('TMDB failure falls back to the separate Home last-good cache', async () => {
    const now = new Date('2026-08-09T00:00:00.000Z');
    const cached = {
        results: Array.from({ length: 10 }, (_, index) => movie(index + 1, 100 - index)),
        generatedAt: '2026-08-08T00:00:00.000Z',
        fetchedPages: 2,
    };
    const cache = createMemoryCache([
        [redisKeys.homeTmdbNowPlayingLastGood('VN'), cached],
    ]);
    const loadHome = createHomeNowShowingService({
        ...cache,
        fetchJson: async () => { throw new Error('upstream unavailable'); },
    });

    const result = await loadHome({ limit: 10, now });

    assert.equal(result.cache, 'stale');
    assert.equal(result.value.results.length, 10);
    assert.equal(result.value.meta.source, 'tmdb-now-playing-last-good');
    assert.equal(result.value.meta.stale, true);
});

test('TMDB failure without a Home last-good cache is a controlled service-unavailable error', async () => {
    const cache = createMemoryCache();
    const loadHome = createHomeNowShowingService({
        ...cache,
        fetchJson: async () => { throw new Error('upstream unavailable'); },
    });

    await assert.rejects(
        loadHome({ limit: 10 }),
        (error) => error.code === 'TMDB_UNAVAILABLE' && error.statusCode === 503,
    );
});

test('Home service has no dependency on bookable Show queries or their cache keys', async () => {
    const source = await readFile(new URL('../services/homeNowShowingService.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /getBookableNowShowingMovies|bookableNowShowing|nowShowingLastGood\(\)/);
    assert.match(source, /homeTmdbNowPlaying/);
});
