import test from 'node:test';
import assert from 'node:assert/strict';
import {
    fetchTmdbHomeNowShowingSources,
    isEligibleHomeNowShowingMovie,
    normalizeHomeNowShowingRegion,
    parseHomeNowShowingLimit,
    rankHomeNowShowingMovies,
} from '../services/homeNowShowingService.js';

const NOW = new Date('2026-07-13T12:00:00.000Z');

const movie = (id, overrides = {}) => ({
    id,
    title: `Movie ${id}`,
    overview: `Overview ${id}`,
    poster_path: `/poster-${id}.jpg`,
    backdrop_path: `/backdrop-${id}.jpg`,
    release_date: '2026-07-01',
    popularity: 100,
    vote_average: 7.5,
    vote_count: 1000,
    adult: false,
    ...overrides,
});

test('home now-showing query inputs are bounded and normalized', () => {
    assert.equal(parseHomeNowShowingLimit(undefined), 10);
    assert.equal(parseHomeNowShowingLimit(0), 1);
    assert.equal(parseHomeNowShowingLimit(200), 20);
    assert.equal(normalizeHomeNowShowingRegion('vn'), 'VN');
    assert.equal(normalizeHomeNowShowingRegion('invalid'), 'US');
});

test('eligibility rejects adult, missing-poster, invalid-date, and out-of-window movies', () => {
    assert.equal(isEligibleHomeNowShowingMovie(movie(1), { now: NOW }), true);
    assert.equal(isEligibleHomeNowShowingMovie(movie(2, { adult: true }), { now: NOW }), false);
    assert.equal(isEligibleHomeNowShowingMovie(movie(3, { poster_path: null }), { now: NOW }), false);
    assert.equal(isEligibleHomeNowShowingMovie(movie(4, { release_date: '' }), { now: NOW }), false);
    assert.equal(isEligibleHomeNowShowingMovie(movie(5, { release_date: '2025-01-01' }), { now: NOW }), false);
    assert.equal(isEligibleHomeNowShowingMovie(movie(6, { release_date: '2026-07-20' }), { now: NOW }), true);
    assert.equal(isEligibleHomeNowShowingMovie(movie(7, { release_date: '2026-07-21' }), { now: NOW }), false);
});

test('ranking deduplicates sources and favors a recent movie that is both now-playing and trending', () => {
    const shared = movie(10, { release_date: '2026-07-10', popularity: 300 });
    const results = rankHomeNowShowingMovies({
        nowPlayingPages: [[
            movie(20, { release_date: '2026-06-15', popularity: 80 }),
            shared,
        ], [
            movie(30, { release_date: '2026-07-12', popularity: 60 }),
        ]],
        trendingMovies: [shared, movie(40, { release_date: '2026-05-01', popularity: 500 })],
        limit: 10,
        now: NOW,
    });

    assert.equal(results[0]._id, '10');
    assert.equal(results.filter((item) => item._id === '10').length, 1);
    assert.deepEqual(new Set(results.map((item) => item._id)), new Set(['10', '20', '30', '40']));
});

test('ranking order is deterministic when scores and release dates tie', () => {
    const input = [movie(2), movie(10), movie(1)];
    const first = rankHomeNowShowingMovies({ nowPlayingPages: [input], now: NOW });
    const second = rankHomeNowShowingMovies({ nowPlayingPages: [input], now: NOW });
    assert.deepEqual(first.map((item) => item._id), second.map((item) => item._id));
});

test('TMDB source loading tolerates a failed page and keeps successful sources', async () => {
    const fetchList = async (path, params) => {
        if (path === '/movie/now_playing' && params.page === 2) throw new Error('page failed');
        if (path === '/trending/movie/week') return [movie(3)];
        return [movie(1), movie(2)];
    };

    const result = await fetchTmdbHomeNowShowingSources({ region: 'us', fetchList });
    assert.equal(result.nowPlayingPages[0].length, 2);
    assert.equal(result.nowPlayingPages[1].length, 0);
    assert.equal(result.trendingMovies.length, 1);
    assert.deepEqual(result.failures, ['now-playing-page-2']);
    assert.deepEqual(result.sources, {
        nowPlaying: { requested: 2, succeeded: 1 },
        trending: { requested: 1, succeeded: 1 },
    });
});
