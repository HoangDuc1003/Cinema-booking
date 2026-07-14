import test from 'node:test';
import assert from 'node:assert/strict';
import { createGetTmdbVideosHandler } from '../controllers/showController.js';
import { redisKeys } from '../services/redisKeys.js';

const createResponse = () => ({
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    set(name, value) {
        this.headers[name] = value;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    },
});

const sendResponseWithoutRedis = async (res, _key, _ttl, loader) => {
    const value = await loader();
    return res.set('X-Cache', 'miss').json({ success: true, data: value });
};

test('TMDB video upstream failure returns 502 instead of a cacheable empty result', async (t) => {
    t.mock.method(console, 'error', () => {});
    const handler = createGetTmdbVideosHandler({
        fetchJson: async () => {
            throw new Error('TMDB unavailable');
        },
        sendResponse: sendResponseWithoutRedis,
    });
    const res = createResponse();

    await handler({ params: { movieId: '123' } }, res);

    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.body, {
        success: false,
        message: 'Unable to load movie videos.',
    });
});

test('TMDB genuine empty video result remains a 200 success response', async () => {
    const emptyResult = { id: 123, results: [] };
    const handler = createGetTmdbVideosHandler({
        fetchJson: async (path, params) => {
            assert.equal(path, '/movie/123/videos');
            assert.deepEqual(params, { language: 'en-US' });
            return emptyResult;
        },
        sendResponse: sendResponseWithoutRedis,
    });
    const res = createResponse();

    await handler({ params: { movieId: '123' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['X-Cache'], 'miss');
    assert.deepEqual(res.body, { success: true, data: emptyResult });
});

test('TMDB video cache key uses the videos-v2 namespace', () => {
    assert.match(redisKeys.tmdbVideos('123'), /:cache:tmdb:videos-v2:123$/);
});
