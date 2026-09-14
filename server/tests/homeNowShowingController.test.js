import assert from 'node:assert/strict';
import test from 'node:test';
import { createGetHomeNowShowingHandler } from '../controllers/showController.js';

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

const createValue = (ids = ['100', '101']) => ({
    results: ids.map((id) => ({ _id: id, id, title: `Movie ${id}`, poster_path: `/poster-${id}.jpg` })),
    meta: {
        region: 'VN',
        limit: 10,
        source: 'weekly-catalog',
        catalog: { batchId: 'batch-1', version: 4, slot: 2 },
    },
});

test('home now-showing returns stable ETag, CDN stale policy, provenance, and timing headers', async () => {
    const value = createValue();
    const handler = createGetHomeNowShowingHandler({
        loadHome: async () => ({
            value,
            cache: 'catalog',
            timing: { dbConnectMs: 8, indexVerificationMs: 0, redisMs: 12, catalogMs: 20 },
        }),
    });
    const first = createResponse();
    await handler({ query: { limit: '10', region: 'vn' }, get: () => undefined }, first);

    assert.equal(first.statusCode, 200);
    assert.equal(first.body.success, true);
    assert.equal(first.headers['X-Cache'], 'catalog');
    assert.equal(first.headers['X-Data-Source'], 'weekly-catalog');
    assert.equal(first.headers['X-Catalog-Version'], '4');
    assert.equal(first.headers['X-Catalog-Slot'], '2');
    assert.equal(first.headers['Cache-Control'], 'public, max-age=60, stale-if-error=86400');
    assert.equal(first.headers['Vercel-CDN-Cache-Control'], 's-maxage=300, stale-while-revalidate=43200, stale-if-error=86400');
    assert.equal(first.headers.Vary, 'Origin, X-Vercel-IP-Country');
    assert.match(first.headers['Server-Timing'], /db;dur=8\.00/);
    assert.match(first.headers['Server-Timing'], /indexes;dur=0\.00/);

    const second = createResponse();
    await handler({ query: {}, get: (name) => name === 'if-none-match' ? first.headers.ETag : undefined }, second);
    assert.equal(second.statusCode, 304);
    assert.equal(second.ended, true);
    assert.equal(second.body, undefined);
});

test('home now-showing ETag changes when the server movie list changes', async () => {
    let value = createValue();
    const handler = createGetHomeNowShowingHandler({
        loadHome: async () => ({ value, cache: 'catalog' }),
    });
    const first = createResponse();
    await handler({ query: {}, get: () => undefined }, first);
    const originalEtag = first.headers.ETag;

    value = createValue(['100', '102']);
    const changed = createResponse();
    await handler({ query: {}, get: () => undefined }, changed);
    assert.notEqual(changed.headers.ETag, originalEtag);
});

test('empty home now-showing responses are unavailable and are never publicly cached', async () => {
    const handler = createGetHomeNowShowingHandler({
        loadHome: async () => ({ value: { results: [], meta: { source: 'empty' } }, cache: 'bypass' }),
    });
    const response = createResponse();
    await handler({ query: {}, get: () => undefined }, response);

    assert.equal(response.statusCode, 503);
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.equal(response.headers.ETag, undefined);
    assert.equal(response.body.success, false);
});

test('TMDB Home failure returns a controlled 503 without exposing internal details', async (t) => {
    t.mock.method(console, 'error', () => {});
    const handler = createGetHomeNowShowingHandler({
        loadHome: async () => {
            throw Object.assign(new Error('Bearer must-not-escape'), {
                code: 'TMDB_UNAVAILABLE',
            });
        },
    });
    const response = createResponse();

    await handler({ query: {}, get: () => undefined }, response);

    assert.equal(response.statusCode, 503);
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.equal(response.body.success, false);
    assert.equal(response.body.code, 'TMDB_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(response.body), /must-not-escape|Bearer/i);
});

test('title and synopsis follow the viewer country; genres stay English and the ETag differs per language', async () => {
    const value = createValue(['100', '101']);
    value.results[0].overview = 'An English synopsis.';
    const calls = [];
    const handler = createGetHomeNowShowingHandler({
        loadHome: async () => ({ value, cache: 'miss' }),
        localizeText: async (movies, language) => {
            calls.push(language);
            return language === 'vi-VN' ? movies.map((movie) => ({ ...movie, title: `Phim ${movie.id}`, overview: `Mô tả ${movie.id}` })) : movies;
        },
    });
    const headerGet = (country) => (name) => (name.toLowerCase() === 'x-vercel-ip-country' ? country : undefined);

    const vietnam = createResponse();
    await handler({ query: {}, get: headerGet('VN') }, vietnam);
    const unitedStates = createResponse();
    await handler({ query: {}, get: headerGet('US') }, unitedStates);

    assert.deepEqual(calls, ['vi-VN', 'en-US']);
    assert.equal(vietnam.body.data.results[0].title, 'Phim 100');
    assert.equal(vietnam.body.data.results[0].overview, 'Mô tả 100');
    assert.equal(unitedStates.body.data.results[0].overview, 'An English synopsis.');
    assert.equal(vietnam.body.data.meta.titleLanguage, 'vi-VN');
    assert.equal(vietnam.headers['Content-Language'], 'vi-VN');
    assert.equal(unitedStates.body.data.results[0].title, 'Movie 100');
    assert.notEqual(vietnam.headers.ETag, unitedStates.headers.ETag);
    // The shared cache must not hand the Vietnamese copy to other countries.
    assert.equal(vietnam.headers.Vary, 'Origin, X-Vercel-IP-Country');
    // The cached server value is never mutated in place.
    assert.equal(value.results[0].title, 'Movie 100');
});
