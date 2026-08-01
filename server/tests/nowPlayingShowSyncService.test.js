import assert from 'node:assert/strict';
import test from 'node:test';
import Show from '../models/Show.js';
import {
    buildGeneratedShows,
    getBookableNowShowingMovies,
    syncNowPlayingShows,
} from '../services/nowPlayingShowSyncService.js';

test('Show stores generated lifecycle fields and a partial unique schedule index', () => {
    assert.equal(Show.schema.path('source').options.default, 'manual');
    assert.equal(Show.schema.path('bookingOpen').options.default, true);
    assert.equal(Show.schema.path('region').options.default, 'VN');

    const scheduleIndex = Show.schema.indexes().find(([fields]) => fields.scheduleKey === 1);
    assert.deepEqual(scheduleIndex?.[1]?.partialFilterExpression, {
        scheduleKey: { $type: 'string' },
    });
    assert.equal(scheduleIndex?.[1]?.unique, true);
});

test('generated VN schedules use local dates, weekday/weekend times, and stable keys', () => {
    const shows = buildGeneratedShows({
        movieIds: ['101'],
        now: new Date('2026-08-01T01:00:00.000Z'),
        days: 7,
        showPrice: 120,
    });

    assert.equal(shows.length, 148);
    assert.equal(shows[0].showDateTime.toISOString(), '2026-08-01T01:30:00.000Z');
    assert.equal(shows[0].scheduleKey, 'tmdb-vn:101:2026-08-01:08:30:Hall 1');
    assert.equal(shows[0].source, 'tmdb-now-playing');
    assert.equal(shows[0].region, 'VN');
    assert.equal(shows[0].bookingOpen, true);
});

test('sync fetches only TMDB now-playing VN movies, closes stale shows, and idempotently upserts shows', async () => {
    const calls = { movieOps: [], close: null, showOps: [], invalidated: false, log: null };
    const movieModel = {
        bulkWrite: async (operations) => {
            calls.movieOps = operations;
            return { upsertedCount: 2 };
        },
    };
    const showModel = {
        updateMany: async (filter, update) => {
            calls.close = { filter, update };
            return { modifiedCount: 3 };
        },
        bulkWrite: async (operations) => {
            calls.showOps = operations;
            return { upsertedCount: 1 };
        },
    };
    const result = await syncNowPlayingShows({
        now: new Date('2026-08-01T01:00:00.000Z'),
        fetcher: async (url, options) => {
            assert.equal(url, 'https://api.themoviedb.org/3/movie/now_playing');
            assert.deepEqual(options.params, { region: 'VN', language: 'vi-VN', page: 1 });
            return {
                data: {
                    results: [
                        { id: 101, title: 'One', overview: 'One', vote_average: 8 },
                        { id: 102, title: 'Two', overview: 'Two', vote_average: 7 },
                    ],
                },
            };
        },
        movieModel,
        showModel,
        invalidate: async () => { calls.invalidated = true; },
        logger: { info: (message) => { calls.log = JSON.parse(message); } },
    });

    assert.equal(result.movies, 2);
    assert.equal(result.moviesCreated, 2);
    assert.equal(result.showsCreated, 1);
    assert.equal(result.showsReused, 295);
    assert.equal(result.showsClosed, 3);
    assert.equal(calls.movieOps.length, 2);
    assert.deepEqual(calls.close.filter.movie.$nin, ['101', '102']);
    assert.equal(calls.close.filter.source, 'tmdb-now-playing');
    assert.equal(calls.close.filter.region, 'VN');
    assert.equal(calls.close.update.$set.bookingOpen, false);
    assert.equal(calls.movieOps[0].updateOne.update.$set.genres, undefined);
    assert.deepEqual(calls.movieOps[0].updateOne.update.$setOnInsert.genres, []);
    assert.equal(calls.showOps[0].updateOne.update.$set.bookingOpen, true);
    assert.deepEqual(calls.showOps[0].updateOne.update.$setOnInsert.occupiedSeats, {});
    assert.equal(calls.invalidated, true);
    assert.equal(calls.log.event, 'sync-vn-now-playing-shows');
});

test('bookable now showing reads only open generated shows and de-duplicates movies', async () => {
    let filter;
    const showModel = {
        find: (query) => {
            filter = query;
            const chain = {
                populate: () => chain,
                sort: () => chain,
                lean: async () => [
                    { movie: { _id: '101', title: 'One' } },
                    { movie: { _id: '101', title: 'One' } },
                    { movie: { _id: '102', title: 'Two' } },
                ],
            };
            return chain;
        },
    };

    const movies = await getBookableNowShowingMovies({
        now: new Date('2026-08-01T01:00:00.000Z'),
        showModel,
        limit: 20,
    });

    assert.equal(filter.source, 'tmdb-now-playing');
    assert.equal(filter.region, 'VN');
    assert.equal(filter.bookingOpen, true);
    assert.equal(filter.hall.$ne, 'Virtual Hall');
    assert.equal(filter.showDateTime.$lt.toISOString(), '2026-08-08T01:00:00.000Z');
    assert.deepEqual(movies.map((movie) => movie._id), ['101', '102']);
});

test('TMDB sync does not fall back to another catalog when now-playing fails', async () => {
    let writes = 0;
    await assert.rejects(
        () => syncNowPlayingShows({
            fetcher: async () => { throw new Error('TMDB unavailable'); },
            movieModel: { bulkWrite: async () => { writes += 1; } },
            showModel: { updateMany: async () => { writes += 1; }, bulkWrite: async () => { writes += 1; } },
            invalidate: async () => { writes += 1; },
        }),
        /TMDB unavailable/,
    );
    assert.equal(writes, 0);
});
