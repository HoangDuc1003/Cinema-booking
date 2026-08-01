import assert from 'node:assert/strict';
import test from 'node:test';
import Show from '../models/Show.js';
import {
    buildGeneratedShows,
    ensureDemoShowtimes,
    getBookableNowShowingMovies,
    isDemoShowtimesEnabled,
    syncNowPlayingShows,
} from '../services/nowPlayingShowSyncService.js';

test('Show stores generated lifecycle fields and a partial unique schedule index', () => {
    assert.equal(Show.schema.path('source').options.default, 'manual');
    assert.equal(Show.schema.path('bookingOpen').options.default, true);
    assert.equal(Show.schema.path('region').options.default, 'VN');
    assert.equal(Show.schema.path('scheduleStatus').options.default, 'scheduled');

    const scheduleIndex = Show.schema.indexes().find(([fields]) => fields.scheduleKey === 1);
    assert.deepEqual(scheduleIndex?.[1]?.partialFilterExpression, {
        scheduleKey: { $type: 'string' },
    });
    assert.equal(scheduleIndex?.[1]?.unique, true);
    const legacyIdentityIndex = Show.schema.indexes().find(([fields]) => fields.movie === 1 && fields.showDateTime === 1);
    assert.equal(legacyIdentityIndex?.[1]?.unique, true);
});

test('generated VN schedules use local dates, weekday/weekend times, and stable keys', () => {
    const shows = buildGeneratedShows({
        movieIds: ['101'],
        now: new Date('2026-08-01T01:00:00.000Z'),
        days: 7,
        showPrice: 120,
    });

    assert.equal(shows.length, 7);
    assert.equal(shows[0].showDateTime.toISOString(), '2026-08-01T04:30:00.000Z');
    assert.equal(shows[0].scheduleKey, 'tmdb-vn:101:2026-08-01:11:30:Hall 1');
    assert.equal(shows[0].source, 'tmdb-now-playing');
    assert.equal(shows[0].region, 'VN');
    assert.equal(shows[0].bookingOpen, true);
    assert.ok(shows.every((show) => show.showDateTime > new Date('2026-08-01T01:45:00.000Z')));
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
    assert.equal(result.showsReused, 13);
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
                    { movie: { _id: '101', title: 'One', poster_path: '/one.jpg', runtime: 120 } },
                    { movie: { _id: '101', title: 'One', poster_path: '/one.jpg', runtime: 120 } },
                    { movie: { _id: '102', title: 'Two', poster_path: '/two.jpg', runtime: 120 } },
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

test('generated schedules still provide seven future dates after today has ended', () => {
    const shows = buildGeneratedShows({
        movieIds: ['101'],
        now: new Date('2026-08-01T16:30:00.000Z'),
        days: 7,
    });
    const dates = [...new Set(shows.map((show) => show.showDateTime.toISOString().slice(0, 10)))];
    assert.equal(dates.length, 7);
    assert.equal(dates[0], '2026-08-02');
});

test('sync prioritizes active Hero movies in the seven-day simulated schedule', async () => {
    const calls = { close: null, showOps: [] };
    const movieModel = {
        bulkWrite: async () => ({ upsertedCount: 1 }),
    };
    const showModel = {
        updateMany: async (filter) => {
            calls.close = filter;
            return { modifiedCount: 0 };
        },
        bulkWrite: async (operations) => {
            calls.showOps = operations;
            return { upsertedCount: operations.length };
        },
    };
    const result = await syncNowPlayingShows({
        now: new Date('2026-08-01T01:00:00.000Z'),
        fetcher: async () => ({
            data: { results: [{ id: 101, title: 'Now Playing', poster_path: '/one.jpg' }] },
        }),
        getHeroMovies: async () => ({
            movies: [{ id: 999, title: 'Hero Movie', poster_path: '/hero.jpg', runtime: 100 }],
        }),
        movieModel,
        showModel,
        invalidate: async () => {},
        logger: { info: () => {}, warn: () => {} },
    });

    assert.equal(result.heroMovies, 1);
    assert.equal(result.scheduledMovies, 2);
    assert.ok(calls.close.movie.$nin.includes('999'));
    assert.ok(calls.showOps.some((operation) => operation.updateOne.filter.scheduleKey.includes(':999:')));
});

test('demo showtimes persist seven bookable dates with real Mongo-compatible show IDs', async () => {
    const calls = { operations: [], invalidated: null };
    const movieModel = {
        findById: () => ({ lean: async () => ({
            _id: '101',
            id: '101',
            title: 'Demo Feature',
            runtime: 120,
        }) }),
    };
    const showModel = {
        bulkWrite: async (operations) => {
            calls.operations = operations;
            return { upsertedCount: operations.length };
        },
    };
    const result = await ensureDemoShowtimes({
        movieId: '101',
        now: new Date('2026-08-01T01:00:00.000Z'),
        movieModel,
        showModel,
        lock: async (_key, _options, task) => task({ coordinatedByRedis: false }),
        invalidate: async (movieId) => { calls.invalidated = movieId; },
    });

    assert.equal(result.simulated, true);
    assert.equal(result.days, 7);
    assert.equal(result.showsCreated, 7);
    assert.equal(calls.operations.length, 7);
    assert.equal(calls.invalidated, '101');
    assert.ok(calls.operations.every((operation) => (
        operation.updateOne.update.$setOnInsert.source === 'manual'
        && operation.updateOne.filter.scheduleKey.startsWith('demo-vn:')
        && operation.updateOne.update.$setOnInsert.occupiedSeats
    )));
});

test('demo showtimes are opt-in through the server environment', () => {
    const previous = process.env.DEMO_SHOWTIMES_ENABLED;
    const previousClerkKey = process.env.CLERK_PUBLISHABLE_KEY;
    delete process.env.DEMO_SHOWTIMES_ENABLED;
    process.env.CLERK_PUBLISHABLE_KEY = 'pk_live_example';
    assert.equal(isDemoShowtimesEnabled(), false);
    process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_example';
    assert.equal(isDemoShowtimesEnabled(), true);
    process.env.DEMO_SHOWTIMES_ENABLED = 'true';
    assert.equal(isDemoShowtimesEnabled(), true);
    if (previous === undefined) delete process.env.DEMO_SHOWTIMES_ENABLED;
    else process.env.DEMO_SHOWTIMES_ENABLED = previous;
    if (previousClerkKey === undefined) delete process.env.CLERK_PUBLISHABLE_KEY;
    else process.env.CLERK_PUBLISHABLE_KEY = previousClerkKey;
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

test('an empty TMDB response preserves existing schedules and skips cache invalidation', async () => {
    let writes = 0;
    const result = await syncNowPlayingShows({
        fetcher: async () => ({ data: { results: [] } }),
        movieModel: { bulkWrite: async () => { writes += 1; } },
        showModel: { init: async () => { writes += 1; }, updateMany: async () => { writes += 1; }, bulkWrite: async () => { writes += 1; } },
        invalidate: async () => { writes += 1; },
        logger: { warn: () => {} },
    });
    assert.equal(result.code, 'TMDB_EMPTY_RESPONSE');
    assert.equal(result.skipped, true);
    assert.equal(writes, 0);
});
