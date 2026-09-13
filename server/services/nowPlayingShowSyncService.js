import axios from 'axios';
import { randomUUID } from 'node:crypto';
import Booking from '../models/Booking.js';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import { invalidateMovieCatalog } from './cacheInvalidationService.js';
import { getPublicHomeHero } from './heroService.js';
import { withDistributedLock } from './lockService.js';
import { redisKeys, redisTtl } from './redisKeys.js';
import { parseCinemaShowDateTime } from './showtimeService.js';

export const TMDB_REGION = 'VN';
export const TMDB_LANGUAGE = 'vi-VN';
export const SCHEDULE_DAYS = 7;
export const DEFAULT_SHOW_PRICE = 100;
export const DEFAULT_RUNTIME_MINUTES = 120;
export const SCHEDULE_BUFFER_MINUTES = 45;
export const CLEANUP_MINUTES = 30;
export const DEMO_SHOWTIMES_SOURCE = 'manual';

export const HALLS = Object.freeze([
    'Hall 1',
    'Hall 2',
    'Hall 3',
    'Hall 4',
]);

export const SHOWS_PER_DAY = 3;
// Mock schedules start any time between opening and the last start, on a
// 15-minute grid so the times still look like a real cinema's.
export const FIRST_SHOW_MINUTE = 9 * 60;
export const LAST_SHOW_MINUTE = 23 * 60;
export const SHOW_SLOT_STEP_MINUTES = 15;

const DAY_MS = 24 * 60 * 60 * 1000;
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

const asDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new RangeError('Invalid sync date.');
    return date;
};

const normalizeRegion = (value) => {
    return TMDB_REGION;
};

const normalizeDays = (value) => {
    const days = Number.parseInt(value, 10);
    return Number.isFinite(days) && days > 0 ? days : SCHEDULE_DAYS;
};

const normalizeLimit = (value) => {
    const limit = Number.parseInt(value, 10);
    return Math.min(Math.max(Number.isFinite(limit) && limit > 0 ? limit : 20, 1), 100);
};

const normalizePrice = (value) => {
    const price = Number(value ?? process.env.TMDB_NOW_PLAYING_SHOW_PRICE);
    return Number.isFinite(price) && price > 0 ? price : DEFAULT_SHOW_PRICE;
};

const normalizeRuntime = (value) => {
    const runtime = Number(value);
    return Number.isFinite(runtime) && runtime > 0 ? runtime : DEFAULT_RUNTIME_MINUTES;
};

const tmdbHeaders = () => ({
    Authorization: `Bearer ${process.env.TMDB_API_KEY || ''}`,
});

const toMovieId = (movie) => {
    const id = String(movie?.id ?? movie?._id ?? '').trim();
    return /^\d+$/.test(id) ? id : '';
};

const toMovieUpdate = (movie, movieId) => {
    const set = {
        title: String(movie.title || movie.name || movie.original_title || `TMDB Movie ${movieId}`),
        overview: String(movie.overview || ''),
        poster_path: String(movie.poster_path || ''),
        backdrop_path: String(movie.backdrop_path || ''),
        release_date: String(movie.release_date || ''),
        original_language: String(movie.original_language || ''),
        tagline: String(movie.tagline || ''),
        vote_average: Number.isFinite(Number(movie.vote_average)) ? Number(movie.vote_average) : 0,
        vote_count: Number.isFinite(Number(movie.vote_count)) ? Number(movie.vote_count) : 0,
        popularity: Number.isFinite(Number(movie.popularity)) ? Number(movie.popularity) : 0,
        adult: movie.adult === true,
    };
    const setOnInsert = {};
    if (Array.isArray(movie.genres)) set.genres = movie.genres;
    else setOnInsert.genres = [];
    if (Array.isArray(movie.casts)) set.casts = movie.casts;
    else setOnInsert.casts = [];
    if (Number(movie.runtime) > 0) set.runtime = Number(movie.runtime);
    else setOnInsert.runtime = DEFAULT_RUNTIME_MINUTES;
    return { set, setOnInsert };
};

export const fetchNowPlayingMovies = async ({ fetcher = axios.get } = {}) => {
    if (fetcher === axios.get && !process.env.TMDB_API_KEY) {
        throw Object.assign(new Error('TMDB_API_KEY is not configured'), {
            code: 'INVALID_CONFIGURATION',
            statusCode: 503,
        });
    }

    const { data } = await fetcher(
        'https://api.themoviedb.org/3/movie/now_playing',
        {
            headers: tmdbHeaders(),
            params: {
                region: TMDB_REGION,
                language: TMDB_LANGUAGE,
                page: 1,
            },
            timeout: Number(process.env.TMDB_TIMEOUT_MS) || 5000,
        },
    );

    return Array.isArray(data?.results) ? data.results : [];
};

export const getScheduleDateKeys = ({ now = new Date(), days = SCHEDULE_DAYS, startOffset = 0 } = {}) => {
    const start = asDate(now);
    const localStart = new Date(start.getTime() + VIETNAM_OFFSET_MS);
    const year = localStart.getUTCFullYear();
    const month = localStart.getUTCMonth();
    const day = localStart.getUTCDate();
    const count = normalizeDays(days);

    const safeOffset = Number.isFinite(Number(startOffset)) ? Number(startOffset) : 0;
    return Array.from({ length: count }, (_, offset) => {
        const localDate = new Date(Date.UTC(year, month, day + safeOffset + offset));
        const dateKey = [
            localDate.getUTCFullYear(),
            String(localDate.getUTCMonth() + 1).padStart(2, '0'),
            String(localDate.getUTCDate()).padStart(2, '0'),
        ].join('-');
        return { dateKey, weekday: localDate.getUTCDay() };
    });
};

// FNV-1a: a stable 32-bit hash so a movie/date pair always seeds the same draw.
const hashSeed = (value) => {
    let hash = 0x811c9dc5;
    for (const char of String(value)) {
        hash ^= char.codePointAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

// mulberry32: tiny seeded PRNG, good enough to scatter mock showtimes.
const seededRandom = (seed) => {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const minuteToTime = (minute) => (
    `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
);

const SHOW_SLOT_MINUTES = Object.freeze(Array.from(
    { length: Math.floor((LAST_SHOW_MINUTE - FIRST_SHOW_MINUTE) / SHOW_SLOT_STEP_MINUTES) + 1 },
    (_, index) => FIRST_SHOW_MINUTE + (index * SHOW_SLOT_STEP_MINUTES),
));

// The draw looks random but is seeded by movie and date. Sync runs daily and
// upserts by scheduleKey, so a truly random draw would pile up extra shows on
// every run instead of converging on the same three.
// The draw always runs over the whole day, never only the slots still ahead:
// narrowing the pool would reshuffle today's times whenever sync runs mid-day.
export const pickDailyShowTimes = ({ movieId, dateKey, runtime }) => {
    const random = seededRandom(hashSeed(`${movieId}:${dateKey}`));

    // One movie's own shows never overlap, so the same audience could catch any
    // of the three. Capped so a very long film still fits three into one day.
    const gap = Math.min(
        normalizeRuntime(runtime) + CLEANUP_MINUTES,
        Math.floor((LAST_SHOW_MINUTE - FIRST_SHOW_MINUTE) / SHOWS_PER_DAY),
    );
    // A greedy pick can paint itself into a corner when the gap is wide, so
    // reshuffle a few times before settling for fewer shows.
    let best = [];
    for (let attempt = 0; attempt < 12 && best.length < SHOWS_PER_DAY; attempt += 1) {
        const order = [...SHOW_SLOT_MINUTES];
        for (let index = order.length - 1; index > 0; index -= 1) {
            const swap = Math.floor(random() * (index + 1));
            [order[index], order[swap]] = [order[swap], order[index]];
        }
        const picked = [];
        for (const minute of order) {
            if (picked.every((other) => Math.abs(other - minute) >= gap)) picked.push(minute);
            if (picked.length === SHOWS_PER_DAY) break;
        }
        if (picked.length > best.length) best = picked;
    }
    return best.sort((left, right) => left - right).map(minuteToTime);
};

export const buildGeneratedShows = ({
    movieIds = [],
    movies = [],
    now = new Date(),
    days = SCHEDULE_DAYS,
    region = TMDB_REGION,
    showPrice = DEFAULT_SHOW_PRICE,
} = {}) => {
    const normalizedRegion = normalizeRegion(region);
    const price = normalizePrice(showPrice);
    const generatedShows = [];
    const normalizedDays = normalizeDays(days);
    const normalizedMovies = (movies.length ? movies : movieIds.map((id) => ({ id })))
        .map((movie) => ({
            id: toMovieId(movie),
            runtime: normalizeRuntime(movie?.runtime),
        }))
        .filter((movie) => movie.id);
    const earliestAllowed = asDate(now).getTime() + (SCHEDULE_BUFFER_MINUTES * 60 * 1000);
    // One spare date: when some of today's shows have already started, today
    // keeps what is left and the full number of whole days still follows.
    const dateKeys = getScheduleDateKeys({ now, days: normalizedDays + 1 });

    for (const movie of normalizedMovies) {
        let fullDays = 0;
        for (const { dateKey } of dateKeys) {
            if (fullDays === normalizedDays) break;
            const upcoming = pickDailyShowTimes({ movieId: movie.id, dateKey, runtime: movie.runtime })
                .map((time) => ({ time, showDateTime: parseCinemaShowDateTime(dateKey, time) }))
                .filter(({ showDateTime }) => showDateTime.getTime() > earliestAllowed);
            if (upcoming.length === SHOWS_PER_DAY) fullDays += 1;
            // The day's shows never overlap, so they share one hall: seat layout
            // asks for a hall first, and all three times should sit behind it.
            // Seats belong to the show, so hall packing across movies is not solved.
            const hall = HALLS[hashSeed(`${movie.id}:${dateKey}`) % HALLS.length];
            upcoming.forEach(({ time, showDateTime }) => {
                generatedShows.push({
                    movie: movie.id,
                    showDateTime,
                    showPrice: price,
                    hall,
                    source: 'tmdb-now-playing',
                    region: normalizedRegion,
                    bookingOpen: true,
                    scheduleStatus: 'scheduled',
                    scheduleKey: `tmdb-${normalizedRegion.toLowerCase()}:${movie.id}:${dateKey}:${time}:${hall}`,
                });
            });
        }
    }

    return generatedShows.sort((left, right) => left.showDateTime - right.showDateTime);
};

const upsertMovies = async ({ movies, movieModel }) => {
    const uniqueMovies = [...new Map(
        movies
            .map((movie) => [toMovieId(movie), movie])
            .filter(([movieId]) => movieId),
    ).values()];
    if (!uniqueMovies.length) return { movieIds: [], movies: [], created: 0, reused: 0 };

    const operations = uniqueMovies.map((movie) => {
        const movieId = toMovieId(movie);
        const update = toMovieUpdate(movie, movieId);
        return {
            updateOne: {
                filter: { _id: movieId },
                update: {
                    $set: update.set,
                    $setOnInsert: update.setOnInsert,
                },
                upsert: true,
            },
        };
    });
    const result = await movieModel.bulkWrite(operations, { ordered: false });
    if (typeof movieModel.updateMany === 'function') {
        // TMDB list responses omit runtime. Repair only missing legacy values and
        // preserve any runtime already enriched from the movie-details endpoint.
        await movieModel.updateMany(
            {
                _id: { $in: uniqueMovies.map(toMovieId) },
                $or: [{ runtime: { $exists: false } }, { runtime: { $lte: 0 } }],
            },
            { $set: { runtime: DEFAULT_RUNTIME_MINUTES } },
        );
    }
    const created = Number(result?.upsertedCount ?? result?.nUpserted ?? 0);
    return {
        movieIds: uniqueMovies.map(toMovieId),
        movies: uniqueMovies,
        created,
        reused: Math.max(0, uniqueMovies.length - created),
    };
};

const closeStaleShows = async ({ showModel, activeMovieIds, now, region }) => {
    const result = await showModel.updateMany(
        {
            source: 'tmdb-now-playing',
            region,
            bookingOpen: true,
            showDateTime: { $gte: now },
            movie: { $nin: activeMovieIds },
        },
        { $set: { bookingOpen: false, scheduleStatus: 'closed' } },
    );
    return Number(result?.modifiedCount ?? result?.nModified ?? 0);
};

// Future generated shows for these movies that the current draw no longer
// produces (for example the old one-show-a-day pattern). A show that anyone has
// booked, or is still checking out on, stays exactly as it is: holds live in
// Booking/SeatReservation, not only in the legacy occupiedSeats map.
const closeSupersededShows = async ({ showModel, bookingModel, generatedShows, now, keyPrefix }) => {
    if (!generatedShows.length || typeof showModel.find !== 'function') return 0;
    const candidates = await showModel.find({
        movie: { $in: [...new Set(generatedShows.map((show) => show.movie))] },
        scheduleKey: {
            $regex: `^${keyPrefix}:`,
            $nin: generatedShows.map((show) => show.scheduleKey),
        },
        bookingOpen: true,
        showDateTime: { $gte: asDate(now) },
        occupiedSeats: {},
    }).select('_id').lean();
    if (!candidates.length) return 0;

    const booked = new Set((await bookingModel.distinct('show', {
        show: { $in: candidates.map((show) => show._id) },
    })).map(String));
    const closable = candidates.map((show) => show._id).filter((id) => !booked.has(String(id)));
    if (!closable.length) return 0;

    const result = await showModel.updateMany(
        // Re-checked here so a show that took a seat since the read stays open.
        { _id: { $in: closable }, bookingOpen: true, occupiedSeats: {} },
        { $set: { bookingOpen: false, scheduleStatus: 'closed' } },
    );
    return Number(result?.modifiedCount ?? result?.nModified ?? 0);
};

const upsertShows = async ({ showModel, generatedShows, syncBatchId }) => {
    if (!generatedShows.length) return { created: 0, reused: 0 };

    const result = await showModel.bulkWrite(
        generatedShows.map((show) => {
            const { bookingOpen, scheduleStatus, ...insertFields } = show;
            return {
                updateOne: {
                    filter: { scheduleKey: show.scheduleKey },
                    update: {
                        $setOnInsert: {
                            ...insertFields,
                            occupiedSeats: {},
                        },
                        $set: { bookingOpen: true, scheduleStatus: 'scheduled', syncBatchId },
                    },
                    upsert: true,
                },
            };
        }),
        { ordered: false },
    );
    const created = Math.min(
        generatedShows.length,
        Number(result?.upsertedCount ?? result?.nUpserted ?? 0),
    );
    return { created, reused: generatedShows.length - created };
};

const toDemoMovie = (movie, movieId) => ({
    ...movie,
    id: movie?.id ?? movie?._id ?? movieId,
    _id: movie?._id ?? movie?.id ?? movieId,
    runtime: normalizeRuntime(movie?.runtime),
});

const fetchMovieForDemoSchedule = async (movieId, fetcher = axios.get) => {
    if (fetcher === axios.get && !process.env.TMDB_API_KEY) {
        throw Object.assign(new Error('TMDB_API_KEY is not configured'), {
            code: 'INVALID_CONFIGURATION',
            statusCode: 503,
        });
    }

    const { data } = await fetcher(
        `https://api.themoviedb.org/3/movie/${encodeURIComponent(movieId)}`,
        {
            headers: tmdbHeaders(),
            timeout: Number(process.env.TMDB_TIMEOUT_MS) || 5000,
        },
    );
    return toDemoMovie(data, movieId);
};

export const isDemoScheduleKey = (value) => String(value || '').startsWith('demo-vn:');

export const isDemoShowtimesEnabled = () => {
    const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production'
        || String(process.env.VERCEL_ENV || '').trim().toLowerCase() === 'production';
    if (isProduction) return false;

    const configured = String(process.env.DEMO_SHOWTIMES_ENABLED || '').trim();
    return configured
        ? configured.toLowerCase() === 'true'
        : /^pk_test_/i.test(String(process.env.CLERK_PUBLISHABLE_KEY || '').trim());
};

export const ensureDemoShowtimes = async ({
    movieId,
    now = new Date(),
    days = SCHEDULE_DAYS,
    showPrice,
    fetcher = axios.get,
    movieModel = Movie,
    showModel = Show,
    bookingModel = Booking,
    invalidate = invalidateMovieCatalog,
    lock = withDistributedLock,
} = {}) => {
    const normalizedMovieId = String(movieId || '').trim();
    if (!/^\d+$/.test(normalizedMovieId)) {
        throw Object.assign(new Error('A valid movie ID is required.'), { statusCode: 400 });
    }

    return lock(
        redisKeys.demoShowtimesLock(normalizedMovieId),
        { ttlMs: redisTtl.nowPlayingSyncLockMs, waitMs: 0, retryMs: 100 },
        async () => {
            let movie = await movieModel.findById(normalizedMovieId).lean();
            if (!movie) {
                movie = await fetchMovieForDemoSchedule(normalizedMovieId, fetcher);
                const update = toMovieUpdate(movie, normalizedMovieId);
                await movieModel.updateOne(
                    { _id: normalizedMovieId },
                    { $set: update.set, $setOnInsert: update.setOnInsert },
                    { upsert: true },
                );
            }

            const generatedShows = buildGeneratedShows({
                movies: [toDemoMovie(movie, normalizedMovieId)],
                now,
                days,
                region: TMDB_REGION,
                showPrice,
            }).map((show) => ({
                ...show,
                source: DEMO_SHOWTIMES_SOURCE,
                scheduleKey: show.scheduleKey.replace(/^tmdb-vn:/, 'demo-vn:'),
            }));

            const showStats = await upsertShows({
                showModel,
                generatedShows,
                syncBatchId: `demo-vn-${normalizedMovieId}`,
            });
            const showsClosed = await closeSupersededShows({
                showModel,
                bookingModel,
                generatedShows,
                now,
                keyPrefix: 'demo-vn',
            });
            await invalidate(normalizedMovieId);
            return {
                movieId: normalizedMovieId,
                showsCreated: showStats.created,
                showsReused: showStats.reused,
                showsClosed,
                days: normalizeDays(days),
                simulated: true,
            };
        },
    );
};

export const syncNowPlayingShows = async ({
    now = new Date(),
    days = SCHEDULE_DAYS,
    region = TMDB_REGION,
    showPrice,
    fetcher = axios.get,
    movieModel = Movie,
    showModel = Show,
    bookingModel = Booking,
    invalidate = invalidateMovieCatalog,
    lock = withDistributedLock,
    logger = console,
    getHeroMovies = null,
    requestedBy = 'manual-script',
} = {}) => {
    const nowDate = asDate(now);
    const normalizedRegion = normalizeRegion(region);
    return lock(
        redisKeys.nowPlayingSyncLock(),
        { ttlMs: redisTtl.nowPlayingSyncLockMs, waitMs: 0, retryMs: 100 },
        async () => {
            let movies;
            try {
                movies = await fetchNowPlayingMovies({ fetcher });
            } catch (error) {
                if (error?.code === 'INVALID_CONFIGURATION') throw error;
                const safe = Object.assign(new Error('TMDB unavailable'), {
                    code: 'TMDB_UNAVAILABLE',
                    statusCode: 503,
                    cause: error,
                });
                logger.error?.(JSON.stringify({ event: 'tmdb-now-playing-failed', errorCode: safe.code }));
                throw safe;
            }
            const validMovies = movies.filter((movie) => toMovieId(movie));
            if (!validMovies.length) {
                const summary = {
                    success: false,
                    skipped: true,
                    code: 'TMDB_EMPTY_RESPONSE',
                    event: 'sync-vn-now-playing-shows-skipped',
                    region: normalizedRegion,
                    movies: 0,
                    requestedBy,
                };
                logger.warn?.(JSON.stringify(summary));
                return summary;
            }
            if (typeof showModel.init === 'function') await showModel.init();
            const movieStats = await upsertMovies({ movies: validMovies, movieModel });
            if (!movieStats.movieIds.length) {
                return { success: false, skipped: true, code: 'TMDB_NO_VALID_MOVIES', region: normalizedRegion };
            }
            let heroMovies = [];
            const loadHeroMovies = getHeroMovies || (movieModel === Movie ? getPublicHomeHero : null);
            if (loadHeroMovies) {
                try {
                    const heroPayload = await loadHeroMovies({ now: nowDate });
                    heroMovies = Array.isArray(heroPayload) ? heroPayload : (heroPayload?.movies || []);
                } catch (error) {
                    logger.warn?.(JSON.stringify({
                        event: 'hero-schedule-source-unavailable',
                        errorCode: error?.code || error?.name || 'HERO_SOURCE_UNAVAILABLE',
                    }));
                }
            }
            const scheduleMovies = [...new Map(
                [...heroMovies, ...movieStats.movies]
                    .map((movie) => [toMovieId(movie), movie])
                    .filter(([movieId]) => movieId),
            ).values()];
            const scheduleMovieIds = scheduleMovies.map(toMovieId);
            const showsClosed = await closeStaleShows({
                showModel,
                activeMovieIds: scheduleMovieIds,
                now: nowDate,
                region: normalizedRegion,
            });
            const generatedShows = buildGeneratedShows({
                movies: scheduleMovies,
                now: nowDate,
                days,
                region: normalizedRegion,
                showPrice,
            });
            const syncBatchId = `tmdb-vn-${nowDate.toISOString()}-${randomUUID()}`;
            const showStats = await upsertShows({ showModel, generatedShows, syncBatchId });
            const showsSuperseded = await closeSupersededShows({
                showModel,
                bookingModel,
                generatedShows,
                now: nowDate,
                keyPrefix: `tmdb-${normalizedRegion.toLowerCase()}`,
            });
            await invalidate();

            const summary = {
                event: 'sync-vn-now-playing-shows',
                region: normalizedRegion,
                movies: movieStats.movieIds.length,
                moviesCreated: movieStats.created,
                moviesReused: movieStats.reused,
                heroMovies: heroMovies.filter((movie) => toMovieId(movie)).length,
                scheduledMovies: scheduleMovieIds.length,
                showsCreated: showStats.created,
                showsReused: showStats.reused,
                showsClosed,
                showsSuperseded,
                requestedBy,
            };
            logger.info?.(JSON.stringify(summary));
            return { success: true, ...summary };
        },
    );
};

export const getBookableNowShowingMovies = async ({
    now = new Date(),
    days = SCHEDULE_DAYS,
    region = TMDB_REGION,
    limit = 20,
    showModel = Show,
} = {}) => {
    const nowDate = asDate(now);
    const normalizedRegion = normalizeRegion(region);
    const endDate = new Date(nowDate.getTime() + (normalizeDays(days) * DAY_MS));
    const shows = await showModel.find({
        showDateTime: {
            $gte: nowDate,
            $lt: endDate,
        },
        hall: { $ne: 'Virtual Hall' },
        source: 'tmdb-now-playing',
        region: normalizedRegion,
        bookingOpen: true,
    })
        .populate('movie')
        .sort({ showDateTime: 1 })
        .lean();

    const movies = [];
    const seenIds = new Set();
    for (const show of shows) {
        const movie = show?.movie;
        const movieId = movie?._id == null ? '' : String(movie._id);
        const hasPoster = Boolean(movie?.poster_path || movie?.backdrop_path || movie?.poster);
        const hasRuntime = Number(movie?.runtime) > 0;
        if (!movieId || seenIds.has(movieId) || !movie?.title || !hasPoster || !hasRuntime) continue;
        seenIds.add(movieId);
        movies.push(movie);
    }
    return movies.slice(0, normalizeLimit(limit));
};

export default syncNowPlayingShows;
