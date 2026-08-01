import axios from 'axios';
import { randomUUID } from 'node:crypto';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import { invalidateMovieCatalog } from './cacheInvalidationService.js';
import { getPublicHeroRotation } from './heroRotationService.js';
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

export const HALLS = Object.freeze([
    'Hall 1',
    'Hall 2',
    'Hall 3',
    'Hall 4',
]);

export const WEEKDAY_TIMES = Object.freeze([
    '10:00',
    '13:00',
    '16:00',
    '19:00',
    '22:00',
]);

export const WEEKEND_TIMES = Object.freeze([
    '08:30',
    '11:30',
    '14:30',
    '17:30',
    '20:30',
    '23:15',
]);

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

export const getScheduleDateKeys = ({ now = new Date(), days = SCHEDULE_DAYS } = {}) => {
    const start = asDate(now);
    const localStart = new Date(start.getTime() + VIETNAM_OFFSET_MS);
    const year = localStart.getUTCFullYear();
    const month = localStart.getUTCMonth();
    const day = localStart.getUTCDate();
    const count = normalizeDays(days);

    return Array.from({ length: count }, (_, offset) => {
        const localDate = new Date(Date.UTC(year, month, day + offset));
        const dateKey = [
            localDate.getUTCFullYear(),
            String(localDate.getUTCMonth() + 1).padStart(2, '0'),
            String(localDate.getUTCDate()).padStart(2, '0'),
        ].join('-');
        return { dateKey, weekday: localDate.getUTCDay() };
    });
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
    const dateKeys = getScheduleDateKeys({ now, days });
    const normalizedMovies = (movies.length ? movies : movieIds.map((id) => ({ id })))
        .map((movie) => ({
            id: toMovieId(movie),
            runtime: normalizeRuntime(movie?.runtime),
        }))
        .filter((movie) => movie.id);
    const earliestAllowed = asDate(now).getTime() + (SCHEDULE_BUFFER_MINUTES * 60 * 1000);

    for (const { dateKey, weekday } of dateKeys) {
        const times = weekday === 0 || weekday === 6 ? WEEKEND_TIMES : WEEKDAY_TIMES;
        const availableAt = new Map(HALLS.map((hall) => [hall, 0]));
        for (const movie of normalizedMovies) {
            let selected = null;
            for (const time of times) {
                const showDateTime = parseCinemaShowDateTime(dateKey, time);
                if (showDateTime.getTime() <= earliestAllowed) continue;
                for (const hall of HALLS) {
                    if (showDateTime.getTime() < (availableAt.get(hall) || 0)) continue;
                    selected = { time, hall, showDateTime };
                    break;
                }
                if (selected) break;
            }
            if (!selected) continue;
            availableAt.set(
                selected.hall,
                selected.showDateTime.getTime() + ((movie.runtime + CLEANUP_MINUTES) * 60 * 1000),
            );
            generatedShows.push({
                movie: movie.id,
                showDateTime: selected.showDateTime,
                showPrice: price,
                hall: selected.hall,
                source: 'tmdb-now-playing',
                region: normalizedRegion,
                bookingOpen: true,
                scheduleStatus: 'scheduled',
                scheduleKey: `tmdb-${normalizedRegion.toLowerCase()}:${movie.id}:${dateKey}:${selected.time}:${selected.hall}`,
            });
        }
    }

    return generatedShows;
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

export const syncNowPlayingShows = async ({
    now = new Date(),
    days = SCHEDULE_DAYS,
    region = TMDB_REGION,
    showPrice,
    fetcher = axios.get,
    movieModel = Movie,
    showModel = Show,
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
            const loadHeroMovies = getHeroMovies || (movieModel === Movie ? getPublicHeroRotation : null);
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
