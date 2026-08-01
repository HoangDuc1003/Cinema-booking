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
    assert.equal(first.headers.Vary, 'Origin');
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
