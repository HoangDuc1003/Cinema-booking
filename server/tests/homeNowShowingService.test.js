import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeHomeNowShowingMovie,
    normalizeHomeNowShowingRegion,
    parseHomeNowShowingLimit,
} from '../services/homeNowShowingService.js';

test('home now-showing query inputs are bounded and normalized', () => {
    assert.equal(parseHomeNowShowingLimit(undefined), 10);
    assert.equal(parseHomeNowShowingLimit(0), 1);
    assert.equal(parseHomeNowShowingLimit(200), 20);
    assert.equal(normalizeHomeNowShowingRegion('vn'), 'VN');
    assert.equal(normalizeHomeNowShowingRegion('invalid'), 'US');
});

test('home now-showing normalization preserves stored catalog data without a TMDB list dependency', () => {
    const movie = normalizeHomeNowShowingMovie({
        _id: '123',
        title: 'Stored Movie',
        poster_path: '/poster.jpg',
        release_date: '2026-07-01T00:00:00.000Z',
        vote_average: 8.1,
        runtime: 120,
    });
    assert.equal(movie._id, '123');
    assert.equal(movie.id, 123);
    assert.equal(movie.release_date, '2026-07-01');
    assert.equal(movie.vote_average, 8.1);
});
