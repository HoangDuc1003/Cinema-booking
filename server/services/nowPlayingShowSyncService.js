import axios from 'axios';
import { randomUUID } from 'node:crypto';
import Booking from '../models/Booking.js';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import { invalidateMovieCatalog } from './cacheInvalidationService.js';
import { withDistributedLock } from './lockService.js';
import { redisKeys, redisTtl } from './redisKeys.js';
import { getScheduleMovies } from './scheduleMovieService.js';
import { hashSeed, seededRandom } from './seededRandom.js';
import { parseCinemaShowDateTime } from './showtimeService.js';
import { TMDB_LANGUAGE, TMDB_REGION } from './tmdbConfig.js';

export { TMDB_LANGUAGE, TMDB_REGION };
export const SCHEDULE_DAYS = 7;
export const DEFAULT_SHOW_PRICE = 100;
export const DEFAULT_RUNTIME_MINUTES = 120;
export const SCHEDULE_BUFFER_MINUTES = 45;
export const CLEANUP_MINUTES = 30;
export const GENERATED_SHOW_SOURCE = 'tmdb-now-playing';
export const GENERATED_KEY_PREFIX = `tmdb-${TMDB_REGION.toLowerCase()}`;

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

// Only Vietnam is scheduled today; callers still pass a region so that can grow.
const normalizeRegion = () => TMDB_REGION;

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
                    source: GENERATED_SHOW_SOURCE,
                    region: normalizedRegion,
                    bookingOpen: true,
                    scheduleStatus: 'scheduled',
                    scheduleKey: `${GENERATED_KEY_PREFIX}:${movie.id}:${dateKey}:${time}:${hall}`,
                });
            });
        }
    }

    return generatedShows.sort((left, right) => left.showDateTime - right.showDateTime);
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

// Generated keys from before on-demand scheduling used a separate `demo-vn:`
// namespace. Both are ours to supersede; an admin's manual shows never are.
const GENERATED_KEY_PATTERN = '^(?:tmdb|demo)-vn:';

export const isGeneratedScheduleKey = (value) => /^(?:tmdb|demo)-vn:/.test(String(value || ''));

// Future generated shows for these movies that the current draw no longer
// produces (for example the old one-show-a-day pattern). A show that anyone has
// booked, or is still checking out on, stays exactly as it is: holds live in
// Booking/SeatReservation, not only in the legacy occupiedSeats map. Shows about
// to start are left alone too, since the draw never produces those.
const closeSupersededShows = async ({ showModel, bookingModel, generatedShows, now }) => {
    if (!generatedShows.length || typeof showModel.find !== 'function') return 0;
    const candidates = await showModel.find({
        movie: { $in: [...new Set(generatedShows.map((show) => show.movie))] },
        scheduleKey: {
            $regex: GENERATED_KEY_PATTERN,
            $nin: generatedShows.map((show) => show.scheduleKey),
        },
        bookingOpen: true,
        showDateTime: { $gt: new Date(asDate(now).getTime() + (SCHEDULE_BUFFER_MINUTES * 60 * 1000)) },
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

const isDuplicateKeyOnly = (error) => {
    const writeErrors = error?.writeErrors || error?.result?.writeErrors || [];
    return error?.code === 11000
        || (writeErrors.length > 0 && writeErrors.every((writeError) => (writeError?.code ?? writeError?.err?.code) === 11000));
};

const upsertShows = async ({ showModel, generatedShows, syncBatchId, logger = console }) => {
    if (!generatedShows.length) return { created: 0, reused: 0 };

    let result;
    try {
        result = await showModel.bulkWrite(
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
    } catch (error) {
        // An older show already holds that movie, hall and minute under another
        // key (the legacy unique index). That slot is taken, which is the outcome
        // the upsert wanted, so the rest of the unordered batch stands.
        if (!isDuplicateKeyOnly(error)) throw error;
        logger.warn?.(JSON.stringify({
            event: 'generated-show-slot-already-taken',
            syncBatchId,
            duplicates: (error.writeErrors || error.result?.writeErrors || []).length || 1,
        }));
        result = error.result;
    }
    const created = Math.min(
        generatedShows.length,
        Number(result?.upsertedCount ?? result?.nUpserted ?? result?.result?.nUpserted ?? 0),
    );
    return { created, reused: generatedShows.length - created };
};

const toScheduleMovie = (movie, movieId) => ({
    ...movie,
    id: movie?.id ?? movie?._id ?? movieId,
    _id: movie?._id ?? movie?.id ?? movieId,
    runtime: normalizeRuntime(movie?.runtime),
});

const fetchMovieForSchedule = async (movieId, fetcher = axios.get) => {
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
    return toScheduleMovie(data, movieId);
};

// Hero and Now Showing movies may not be in the database yet, and shows
// reference movies by ID. Existing documents are never rewritten here: a Hero
// entry is a trimmed projection (three genres, no cast) of the stored movie.
const ensureMoviesExist = async ({ movies, movieModel }) => {
    const uniqueMovies = [...new Map(
        movies.map((movie) => [toMovieId(movie), movie]).filter(([movieId]) => movieId),
    ).values()];
    if (!uniqueMovies.length) return { created: 0, reused: 0, runtimes: new Map() };

    const result = await movieModel.bulkWrite(uniqueMovies.map((movie) => {
        const movieId = toMovieId(movie);
        const update = toMovieUpdate(movie, movieId);
        return {
            updateOne: {
                filter: { _id: movieId },
                update: { $setOnInsert: { ...update.setOnInsert, ...update.set } },
                upsert: true,
            },
        };
    }), { ordered: false });

    // The stored runtime is better than a list entry's missing one, so the
    // three daily shows are spaced by the real length where it is known.
    const runtimes = new Map();
    if (typeof movieModel.find === 'function') {
        const stored = await movieModel.find({ _id: { $in: uniqueMovies.map(toMovieId) } })
            .select('_id runtime')
            .lean();
        stored.forEach((movie) => runtimes.set(String(movie._id), movie.runtime));
    }
    const created = Number(result?.upsertedCount ?? result?.nUpserted ?? 0);
    return { created, reused: Math.max(0, uniqueMovies.length - created), runtimes };
};

/**
 * Mock showtimes are on unless explicitly switched off. They exist so the Hero
 * and Now Showing movies are bookable, in production too.
 */
export const isShowtimeGenerationEnabled = () => (
    String(process.env.DEMO_SHOWTIMES_ENABLED || '').trim().toLowerCase() !== 'false'
);

/**
 * Brings one scheduled movie's showtimes up to date on demand, so a Hero or Now
 * Showing movie is bookable even before the daily sync has run. Uses the same
 * keys as the sync, so the two converge on the same shows.
 */
export const ensureScheduledShowtimes = async ({
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
    logger = console,
} = {}) => {
    const normalizedMovieId = String(movieId || '').trim();
    if (!/^\d+$/.test(normalizedMovieId)) {
        throw Object.assign(new Error('A valid movie ID is required.'), { statusCode: 400 });
    }

    return lock(
        redisKeys.scheduledShowtimesLock(normalizedMovieId),
        { ttlMs: redisTtl.nowPlayingSyncLockMs, waitMs: 0, retryMs: 100 },
        async () => {
            let movie = await movieModel.findById(normalizedMovieId).lean();
            if (!movie) {
                movie = await fetchMovieForSchedule(normalizedMovieId, fetcher);
                const update = toMovieUpdate(movie, normalizedMovieId);
                await movieModel.updateOne(
                    { _id: normalizedMovieId },
                    { $set: update.set, $setOnInsert: update.setOnInsert },
                    { upsert: true },
                );
            }

            const generatedShows = buildGeneratedShows({
                movies: [toScheduleMovie(movie, normalizedMovieId)],
                now,
                days,
                region: TMDB_REGION,
                showPrice,
            });
            const showStats = await upsertShows({
                showModel,
                generatedShows,
                syncBatchId: `on-demand-${normalizedMovieId}`,
                logger,
            });
            const showsClosed = await closeSupersededShows({ showModel, bookingModel, generatedShows, now });
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

/**
 * Daily sync. Schedules exactly the Hero posters and the home Now Showing list,
 * and closes future generated shows for every other movie.
 */
export const syncNowPlayingShows = async ({
    now = new Date(),
    days = SCHEDULE_DAYS,
    region = TMDB_REGION,
    showPrice,
    movieModel = Movie,
    showModel = Show,
    bookingModel = Booking,
    invalidate = invalidateMovieCatalog,
    lock = withDistributedLock,
    logger = console,
    loadScheduleMovies = getScheduleMovies,
    requestedBy = 'manual-script',
} = {}) => {
    const nowDate = asDate(now);
    const normalizedRegion = normalizeRegion(region);
    return lock(
        redisKeys.nowPlayingSyncLock(),
        { ttlMs: redisTtl.nowPlayingSyncLockMs, waitMs: 0, retryMs: 100 },
        async () => {
            let schedule;
            try {
                schedule = await loadScheduleMovies({ now: nowDate });
            } catch (error) {
                logger.error?.(JSON.stringify({
                    event: 'schedule-movies-unavailable',
                    errorCode: error?.code || error?.name || 'UNKNOWN',
                }));
                throw Object.assign(new Error('Schedule sources unavailable'), {
                    code: error?.code || 'SCHEDULE_SOURCES_UNAVAILABLE',
                    statusCode: 503,
                    cause: error,
                });
            }

            const scheduleMovies = (schedule?.movies || []).filter((movie) => toMovieId(movie));
            if (!scheduleMovies.length) {
                const summary = {
                    success: false,
                    skipped: true,
                    code: 'SCHEDULE_EMPTY',
                    event: 'sync-vn-now-playing-shows-skipped',
                    region: normalizedRegion,
                    movies: 0,
                    requestedBy,
                };
                logger.warn?.(JSON.stringify(summary));
                return summary;
            }
            if (typeof showModel.init === 'function') await showModel.init();
            const movieStats = await ensureMoviesExist({ movies: scheduleMovies, movieModel });
            const scheduleMovieIds = scheduleMovies.map(toMovieId);

            // With one source down the set is missing movies that are still on the
            // site, so nothing is closed until a run sees both.
            const showsClosed = schedule.complete
                ? await closeStaleShows({
                    showModel,
                    activeMovieIds: scheduleMovieIds,
                    now: nowDate,
                    region: normalizedRegion,
                })
                : 0;
            if (!schedule.complete) {
                logger.warn?.(JSON.stringify({ event: 'schedule-movies-partial', failures: schedule.failures || [] }));
            }

            const generatedShows = buildGeneratedShows({
                movies: scheduleMovies.map((movie) => ({
                    id: toMovieId(movie),
                    runtime: movieStats.runtimes.get(toMovieId(movie)) ?? movie.runtime,
                })),
                now: nowDate,
                days,
                region: normalizedRegion,
                showPrice,
            });
            const syncBatchId = `tmdb-vn-${nowDate.toISOString()}-${randomUUID()}`;
            const showStats = await upsertShows({ showModel, generatedShows, syncBatchId, logger });
            const showsSuperseded = await closeSupersededShows({
                showModel,
                bookingModel,
                generatedShows,
                now: nowDate,
            });
            await invalidate();

            const summary = {
                event: 'sync-vn-now-playing-shows',
                region: normalizedRegion,
                movies: scheduleMovieIds.length,
                moviesCreated: movieStats.created,
                moviesReused: movieStats.reused,
                heroMovies: (schedule.heroIds || []).length,
                nowShowingMovies: (schedule.nowShowingIds || []).length,
                scheduledMovies: scheduleMovieIds.length,
                complete: schedule.complete === true,
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
