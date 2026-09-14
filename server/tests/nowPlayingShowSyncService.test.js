import assert from 'node:assert/strict';
import test from 'node:test';
import Show from '../models/Show.js';
import {
    buildGeneratedShows,
    ensureScheduledShowtimes,
    getBookableNowShowingMovies,
    isGeneratedScheduleKey,
    isShowtimeGenerationEnabled,
    pickDailyShowTimes,
    syncNowPlayingShows,
} from '../services/nowPlayingShowSyncService.js';
import { getShowtimeDateKey } from '../services/showtimeService.js';

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

test('generated VN schedules give each movie three drawn times on each of seven local dates', () => {
    const now = new Date('2026-08-01T01:00:00.000Z');
    const shows = buildGeneratedShows({
        movies: [{ id: '101', runtime: 120 }, { id: '102', runtime: 95 }],
        now,
        days: 7,
        showPrice: 120,
    });

    for (const movieId of ['101', '102']) {
        const own = shows.filter((show) => show.movie === movieId);
        assert.equal(own.length, 21);
        const byDate = Map.groupBy(own, (show) => getShowtimeDateKey(show.showDateTime));
        assert.equal(byDate.size, 7);
        assert.equal(byDate.keys().next().value, '2026-08-01');
        for (const dayShows of byDate.values()) {
            assert.equal(dayShows.length, 3);
            assert.equal(new Set(dayShows.map((show) => show.hall)).size, 1);
            // scheduleKey is "tmdb-vn:<movie>:<date>:<HH>:<mm>:<hall>".
            const minutes = dayShows.map((show) => {
                const [, , , hours, mins] = show.scheduleKey.split(':');
                return (Number(hours) * 60) + Number(mins);
            });
            assert.ok(minutes.every((minute) => minute >= 9 * 60 && minute <= 23 * 60 && minute % 15 === 0));
            const runtime = movieId === '101' ? 120 : 95;
            for (let index = 1; index < minutes.length; index += 1) {
                assert.ok(minutes[index] - minutes[index - 1] >= runtime + 30);
            }
        }
    }

    assert.equal(shows[0].source, 'tmdb-now-playing');
    assert.equal(shows[0].region, 'VN');
    assert.equal(shows[0].bookingOpen, true);
    assert.equal(shows[0].showPrice, 120);
    assert.match(shows[0].scheduleKey, /^tmdb-vn:10[12]:2026-08-01:\d{2}:\d{2}:Hall \d$/);
    assert.ok(shows.every((show) => show.showDateTime > new Date('2026-08-01T01:45:00.000Z')));
    assert.equal(new Set(shows.map((show) => show.scheduleKey)).size, shows.length);
});

test('generated times are drawn per movie and date but stable across sync runs', () => {
    const build = (now) => buildGeneratedShows({ movieIds: ['101', '102'], now, days: 7 });
    const first = build(new Date('2026-08-01T01:00:00.000Z'));
    const again = build(new Date('2026-08-01T01:05:00.000Z'));
    assert.deepEqual(again.map((show) => show.scheduleKey), first.map((show) => show.scheduleKey));

    const timesFor = (movieId) => first
        .filter((show) => show.movie === movieId)
        .map((show) => show.scheduleKey.split(':').slice(2, 5).join(':'));
    assert.notDeepEqual(timesFor('101'), timesFor('102'));
    const dailyPatterns = new Set([...Map.groupBy(
        first.filter((show) => show.movie === '101'),
        (show) => getShowtimeDateKey(show.showDateTime),
    ).values()].map((dayShows) => dayShows.map((show) => show.scheduleKey.split(':').slice(3, 5).join(':')).join(',')));
    assert.ok(dailyPatterns.size > 1, 'times should vary from day to day');
});

test('a mid-day sync keeps today\'s remaining times instead of redrawing them', () => {
    const build = (now) => buildGeneratedShows({ movieIds: ['101'], now, days: 7 });
    const morning = build(new Date('2026-08-01T00:00:00.000Z'));
    const evening = build(new Date('2026-08-01T11:00:00.000Z'));
    const cutoff = new Date('2026-08-01T11:45:00.000Z');
    const stillAhead = morning
        .filter((show) => show.showDateTime > cutoff && getShowtimeDateKey(show.showDateTime) === '2026-08-01')
        .map((show) => show.scheduleKey);
    const eveningKeys = new Set(evening.map((show) => show.scheduleKey));
    assert.ok(stillAhead.every((key) => eveningKeys.has(key)));
    // Seven whole days still follow a partly used today.
    const fullDays = [...Map.groupBy(evening, (show) => getShowtimeDateKey(show.showDateTime)).values()]
        .filter((dayShows) => dayShows.length === 3);
    assert.ok(fullDays.length >= 7);
});

test('a very long film still gets three shows a day', () => {
    const times = pickDailyShowTimes({ movieId: '555', dateKey: '2026-08-03', runtime: 400 });
    assert.equal(times.length, 3);
});

const heroMovie = (id, extra = {}) => ({ _id: String(id), id: String(id), title: `Hero ${id}`, poster_path: `/${id}.jpg`, ...extra });
const nowShowingMovie = (id) => ({ _id: String(id), id, title: `Now ${id}`, overview: `Now ${id}`, poster_path: `/${id}.jpg`, release_date: '2026-07-20' });

const scheduleOf = ({ hero = [], nowShowing = [], complete = true } = {}) => async () => {
    const movies = [...new Map([...hero, ...nowShowing].map((movie) => [String(movie._id), movie])).values()];
    return {
        movies,
        heroIds: hero.map((movie) => String(movie._id)),
        nowShowingIds: nowShowing.map((movie) => String(movie._id)),
        complete,
        failures: complete ? [] : [{ source: 'hero', errorCode: 'HERO_POOL_TOO_SMALL' }],
    };
};

const recordingModels = () => {
    const calls = {
        movieOps: [], close: null, candidates: null, bookedQuery: null, superseded: null,
        showOps: [], invalidated: false, log: null, warnings: [],
    };
    const movieModel = {
        bulkWrite: async (operations) => {
            calls.movieOps = operations;
            return { upsertedCount: 1 };
        },
        find: () => {
            const chain = { select: () => chain, lean: async () => [{ _id: '101', runtime: 95 }] };
            return chain;
        },
    };
    const bookingModel = {
        distinct: async (field, query) => {
            calls.bookedQuery = { field, query };
            // Someone is mid-checkout on the second superseded show.
            return ['old-booked'];
        },
    };
    const showModel = {
        find: (filter) => {
            calls.candidates = filter;
            const chain = {
                select: () => chain,
                lean: async () => [{ _id: 'old-free' }, { _id: 'old-booked' }],
            };
            return chain;
        },
        updateMany: async (filter, update) => {
            // First call closes movies that left the schedule; the second closes
            // unbooked shows the new draw no longer produces.
            if (!calls.close && filter.source) {
                calls.close = { filter, update };
                return { modifiedCount: 3 };
            }
            calls.superseded = { filter, update };
            return { modifiedCount: 1 };
        },
        bulkWrite: async (operations) => {
            calls.showOps = operations;
            return { upsertedCount: 1 };
        },
    };
    return { calls, movieModel, bookingModel, showModel };
};

test('sync schedules exactly the Hero and Now Showing movies and closes everything else', async () => {
    const { calls, movieModel, bookingModel, showModel } = recordingModels();
    const result = await syncNowPlayingShows({
        now: new Date('2026-08-01T01:00:00.000Z'),
        loadScheduleMovies: scheduleOf({
            hero: [heroMovie(999, { genres: [{ id: 18, name: 'Drama' }] })],
            nowShowing: [nowShowingMovie(101), nowShowingMovie(102)],
        }),
        movieModel,
        showModel,
        bookingModel,
        invalidate: async () => { calls.invalidated = true; },
        logger: { info: (message) => { calls.log = JSON.parse(message); }, warn: () => {} },
    });

    assert.equal(result.success, true);
    assert.equal(result.heroMovies, 1);
    assert.equal(result.nowShowingMovies, 2);
    assert.equal(result.scheduledMovies, 3);
    assert.equal(result.showsCreated, 1);
    assert.equal(result.showsReused, 62);
    assert.equal(result.showsClosed, 3);
    assert.deepEqual([...new Set(calls.showOps.map((operation) => operation.updateOne.update.$setOnInsert.movie))].sort(), ['101', '102', '999']);

    // Movies are inserted when missing and never rewritten: a Hero entry is a
    // trimmed projection of the stored document.
    assert.equal(calls.movieOps.length, 3);
    assert.ok(calls.movieOps.every((operation) => !operation.updateOne.update.$set && operation.updateOne.upsert));

    assert.deepEqual(calls.close.filter.movie.$nin.sort(), ['101', '102', '999']);
    assert.equal(calls.close.filter.source, 'tmdb-now-playing');
    assert.equal(calls.close.update.$set.bookingOpen, false);

    assert.equal(calls.candidates.scheduleKey.$regex, '^(?:tmdb|demo)-vn:');
    assert.equal(calls.candidates.scheduleKey.$nin.length, 63);
    assert.deepEqual(calls.bookedQuery.query.show.$in, ['old-free', 'old-booked']);
    // Only the show nobody has touched is closed.
    assert.deepEqual(calls.superseded.filter._id.$in, ['old-free']);
    assert.deepEqual(calls.superseded.filter.occupiedSeats, {});
    assert.equal(result.showsSuperseded, 1);

    assert.equal(calls.showOps[0].updateOne.update.$set.bookingOpen, true);
    assert.deepEqual(calls.showOps[0].updateOne.update.$setOnInsert.occupiedSeats, {});
    assert.equal(calls.invalidated, true);
    assert.equal(calls.log.event, 'sync-vn-now-playing-shows');
});

test('sync spaces the daily shows by the stored runtime when the list entry has none', async () => {
    const { calls, movieModel, bookingModel, showModel } = recordingModels();
    await syncNowPlayingShows({
        now: new Date('2026-08-01T01:00:00.000Z'),
        loadScheduleMovies: scheduleOf({ nowShowing: [nowShowingMovie(101)] }),
        movieModel,
        showModel,
        bookingModel,
        invalidate: async () => {},
        logger: { info: () => {}, warn: () => {} },
    });
    const expected = buildGeneratedShows({ movies: [{ id: '101', runtime: 95 }], now: new Date('2026-08-01T01:00:00.000Z') });
    assert.deepEqual(calls.showOps.map((operation) => operation.updateOne.filter.scheduleKey), expected.map((show) => show.scheduleKey));
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

test('a sync missing one source still schedules what it has but closes nothing', async () => {
    const { calls, movieModel, bookingModel, showModel } = recordingModels();
    const warnings = [];
    const result = await syncNowPlayingShows({
        now: new Date('2026-08-01T01:00:00.000Z'),
        loadScheduleMovies: scheduleOf({ nowShowing: [nowShowingMovie(101)], complete: false }),
        movieModel,
        showModel,
        bookingModel,
        invalidate: async () => {},
        logger: { info: () => {}, warn: (message) => warnings.push(JSON.parse(message)) },
    });
    assert.equal(result.success, true);
    assert.equal(result.complete, false);
    assert.equal(result.showsClosed, 0);
    assert.equal(calls.close, null, 'stale shows are left open while a source is down');
    assert.ok(calls.showOps.length > 0);
    assert.ok(warnings.some((warning) => warning.event === 'schedule-movies-partial'));
});

test('on-demand showtimes use the sync keys so both converge on the same shows', async () => {
    const calls = { operations: [], invalidated: null };
    const movieModel = {
        findById: () => ({ lean: async () => ({ _id: '101', id: '101', title: 'Feature', runtime: 120 }) }),
    };
    const showModel = {
        bulkWrite: async (operations) => {
            calls.operations = operations;
            return { upsertedCount: operations.length };
        },
        find: () => {
            const chain = { select: () => chain, lean: async () => [] };
            return chain;
        },
    };
    const now = new Date('2026-08-01T01:00:00.000Z');
    const result = await ensureScheduledShowtimes({
        movieId: '101',
        now,
        movieModel,
        showModel,
        bookingModel: { distinct: async () => [] },
        lock: async (_key, _options, task) => task({ coordinatedByRedis: false }),
        invalidate: async (movieId) => { calls.invalidated = movieId; },
    });

    assert.equal(result.simulated, true);
    assert.equal(result.days, 7);
    assert.equal(result.showsCreated, 21);
    assert.equal(calls.invalidated, '101');
    assert.deepEqual(
        calls.operations.map((operation) => operation.updateOne.filter.scheduleKey),
        buildGeneratedShows({ movies: [{ id: '101', runtime: 120 }], now }).map((show) => show.scheduleKey),
    );
    assert.ok(calls.operations.every((operation) => (
        operation.updateOne.update.$setOnInsert.source === 'tmdb-now-playing'
        && operation.updateOne.filter.scheduleKey.startsWith('tmdb-vn:')
    )));
});

test('a slot already held under an older key does not fail the rest of the batch', async () => {
    const duplicate = Object.assign(new Error('E11000 duplicate key'), {
        code: 11000,
        writeErrors: [{ code: 11000 }, { code: 11000 }],
        result: { upsertedCount: 19 },
    });
    const warnings = [];
    const result = await ensureScheduledShowtimes({
        movieId: '101',
        now: new Date('2026-08-01T01:00:00.000Z'),
        movieModel: { findById: () => ({ lean: async () => ({ _id: '101', runtime: 120 }) }) },
        showModel: {
            bulkWrite: async () => { throw duplicate; },
            find: () => {
                const chain = { select: () => chain, lean: async () => [] };
                return chain;
            },
        },
        bookingModel: { distinct: async () => [] },
        lock: async (_key, _options, task) => task(),
        invalidate: async () => {},
        logger: { warn: (message) => warnings.push(JSON.parse(message)) },
    });
    assert.equal(result.showsCreated, 19);
    assert.equal(warnings[0].event, 'generated-show-slot-already-taken');

    await assert.rejects(() => ensureScheduledShowtimes({
        movieId: '101',
        now: new Date('2026-08-01T01:00:00.000Z'),
        movieModel: { findById: () => ({ lean: async () => ({ _id: '101', runtime: 120 }) }) },
        showModel: { bulkWrite: async () => { throw Object.assign(new Error('network'), { code: 'ECONNRESET' }); } },
        bookingModel: { distinct: async () => [] },
        lock: async (_key, _options, task) => task(),
        invalidate: async () => {},
    }), /network/, 'any other write failure is surfaced');
});

test('generated keys cover both the sync namespace and the legacy demo one', () => {
    assert.equal(isGeneratedScheduleKey('tmdb-vn:101:2026-08-01:13:00:Hall 1'), true);
    assert.equal(isGeneratedScheduleKey('demo-vn:101:2026-08-01:13:00:Hall 1'), true);
    assert.equal(isGeneratedScheduleKey(null), false);
    assert.equal(isGeneratedScheduleKey('admin:101'), false);
});

test('mock showtimes are on by default, production included, and can be switched off', () => {
    const previous = { flag: process.env.DEMO_SHOWTIMES_ENABLED, nodeEnv: process.env.NODE_ENV, vercel: process.env.VERCEL_ENV };
    try {
        delete process.env.DEMO_SHOWTIMES_ENABLED;
        process.env.NODE_ENV = 'production';
        process.env.VERCEL_ENV = 'production';
        assert.equal(isShowtimeGenerationEnabled(), true);
        process.env.DEMO_SHOWTIMES_ENABLED = 'false';
        assert.equal(isShowtimeGenerationEnabled(), false);
        process.env.DEMO_SHOWTIMES_ENABLED = ' FALSE ';
        assert.equal(isShowtimeGenerationEnabled(), false);
        process.env.DEMO_SHOWTIMES_ENABLED = 'true';
        assert.equal(isShowtimeGenerationEnabled(), true);
    } finally {
        for (const [key, value] of [['DEMO_SHOWTIMES_ENABLED', previous.flag], ['NODE_ENV', previous.nodeEnv], ['VERCEL_ENV', previous.vercel]]) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});

test('sync writes nothing when neither schedule source is available', async () => {
    let writes = 0;
    const errors = [];
    await assert.rejects(
        () => syncNowPlayingShows({
            loadScheduleMovies: async () => { throw Object.assign(new Error('down'), { code: 'SCHEDULE_SOURCES_UNAVAILABLE' }); },
            movieModel: { bulkWrite: async () => { writes += 1; } },
            showModel: { updateMany: async () => { writes += 1; }, bulkWrite: async () => { writes += 1; } },
            invalidate: async () => { writes += 1; },
            logger: { error: (message) => errors.push(JSON.parse(message)) },
        }),
        (error) => error.code === 'SCHEDULE_SOURCES_UNAVAILABLE' && error.statusCode === 503,
    );
    assert.equal(writes, 0);
    assert.equal(errors[0].event, 'schedule-movies-unavailable');
});

test('an empty schedule preserves existing shows and skips cache invalidation', async () => {
    let writes = 0;
    const result = await syncNowPlayingShows({
        loadScheduleMovies: scheduleOf(),
        movieModel: { bulkWrite: async () => { writes += 1; } },
        showModel: { init: async () => { writes += 1; }, updateMany: async () => { writes += 1; }, bulkWrite: async () => { writes += 1; } },
        invalidate: async () => { writes += 1; },
        logger: { warn: () => {} },
    });
    assert.equal(result.code, 'SCHEDULE_EMPTY');
    assert.equal(result.skipped, true);
    assert.equal(writes, 0);
});
