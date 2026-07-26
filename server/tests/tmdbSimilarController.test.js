import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createGetTmdbSimilarHandler,
    normalizeSimilarMovieResults,
} from '../controllers/showController.js';

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

test('similar movie normalization removes unsafe entries and ranks bookable movies first', () => {
    const results = normalizeSimilarMovieResults({
        movieId: '1',
        bookableMovieIds: ['3'],
        limit: 4,
        results: [
            { id: 1, title: 'Current', poster_path: '/current.jpg' },
            { id: 2, title: 'First', poster_path: '/first.jpg' },
            { id: 3, title: 'Bookable', backdrop_path: '/bookable.jpg' },
            { id: 2, title: 'Duplicate', poster_path: '/duplicate.jpg' },
            { id: 4, title: 'Adult', poster_path: '/adult.jpg', adult: true },
            { id: 5, title: 'No artwork' },
            { id: 6, title: 'Second', poster_path: '/second.jpg' },
        ],
    });

    assert.deepEqual(results.map((movie) => movie._id), ['3', '2', '6']);
    assert.equal(results[0].hasShowtimes, true);
    assert.equal(results[1].hasShowtimes, false);
});

test('similar endpoint uses TMDB Similar and returns the normalized card contract', async () => {
    const handler = createGetTmdbSimilarHandler({
        fetchJson: async (path, params) => {
            assert.equal(path, '/movie/123/similar');
            assert.deepEqual(params, {
                language: 'en-US',
                include_adult: false,
                page: 1,
            });
            return {
                results: [
                    { id: 200, title: 'Related', poster_path: '/related.jpg' },
                    { id: 201, title: 'Bookable related', poster_path: '/bookable.jpg' },
                ],
            };
        },
        sendResponse: sendResponseWithoutRedis,
        similarKey: (movieId, limit) => `similar:${movieId}:${limit}`,
        loadBookableIds: async () => ['201'],
    });
    const res = createResponse();

    await handler({ params: { movieId: '123' }, query: { limit: '4' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['X-Cache'], 'miss');
    assert.deepEqual(res.body.data.results.map((movie) => movie._id), ['201', '200']);
});

test('similar endpoint validates its movie ID before accessing upstream data', async () => {
    let fetchCalled = false;
    const handler = createGetTmdbSimilarHandler({
        fetchJson: async () => {
            fetchCalled = true;
            return { results: [] };
        },
        sendResponse: sendResponseWithoutRedis,
    });
    const res = createResponse();

    await handler({ params: { movieId: 'mock_123' }, query: {} }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(fetchCalled, false);
    assert.deepEqual(res.body, { success: false, message: 'Invalid movie ID.' });
});

