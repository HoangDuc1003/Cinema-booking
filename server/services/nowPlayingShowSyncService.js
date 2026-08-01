import axios from 'axios';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import { invalidateMovieCatalog } from './cacheInvalidationService.js';
import { parseCinemaShowDateTime } from './showtimeService.js';

export const TMDB_REGION = 'VN';
export const TMDB_LANGUAGE = 'vi-VN';
export const SCHEDULE_DAYS = 7;
export const DEFAULT_SHOW_PRICE = 100;

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
    const region = String(value || TMDB_REGION).trim().toUpperCase();
    return /^[A-Z]{2}$/.test(region) ? region : TMDB_REGION;
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
    if (Number.isFinite(Number(movie.runtime))) set.runtime = Number(movie.runtime);
    else setOnInsert.runtime = 0;
    return { set, setOnInsert };
};

export const fetchNowPlayingMovies = async ({ fetcher = axios.get } = {}) => {
    if (fetcher === axios.get && !process.env.TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY is not configured');
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
    now = new Date(),
    days = SCHEDULE_DAYS,
    region = TMDB_REGION,
    showPrice = DEFAULT_SHOW_PRICE,
} = {}) => {
    const normalizedRegion = normalizeRegion(region);
    const price = normalizePrice(showPrice);
    const generatedShows = [];
    const dateKeys = getScheduleDateKeys({ now, days });

    for (const movieId of movieIds) {
        const normalizedMovieId = String(movieId).trim();
        if (!/^\d+$/.test(normalizedMovieId)) continue;
        for (const { dateKey, weekday } of dateKeys) {
            const times = weekday === 0 || weekday === 6 ? WEEKEND_TIMES : WEEKDAY_TIMES;
            for (const time of times) {
                for (const hall of HALLS) {
                    generatedShows.push({
                        movie: normalizedMovieId,
                        showDateTime: parseCinemaShowDateTime(dateKey, time),
                        showPrice: price,
                        hall,
                        source: 'tmdb-now-playing',
                        region: normalizedRegion,
                        bookingOpen: true,
                        scheduleKey: `tmdb-${normalizedRegion.toLowerCase()}:${normalizedMovieId}:${dateKey}:${time}:${hall}`,
                    });
                }
            }
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
    if (!uniqueMovies.length) return { movieIds: [], created: 0, reused: 0 };

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
    const created = Number(result?.upsertedCount ?? result?.nUpserted ?? 0);
    return {
        movieIds: uniqueMovies.map(toMovieId),
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
        { $set: { bookingOpen: false } },
    );
    return Number(result?.modifiedCount ?? result?.nModified ?? 0);
};

const upsertShows = async ({ showModel, generatedShows }) => {
    if (!generatedShows.length) return { created: 0, reused: 0 };

    const result = await showModel.bulkWrite(
        generatedShows.map((show) => ({
            updateOne: {
                filter: { scheduleKey: show.scheduleKey },
                update: {
                    $setOnInsert: {
                        ...show,
                        occupiedSeats: {},
                    },
                    $set: { bookingOpen: true },
                },
                upsert: true,
            },
        })),
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
    logger = console,
} = {}) => {
    const nowDate = asDate(now);
    const normalizedRegion = normalizeRegion(region);
    const movies = await fetchNowPlayingMovies({ fetcher });
    if (typeof showModel.init === 'function') await showModel.init();
    const movieStats = await upsertMovies({ movies, movieModel });
    const showsClosed = await closeStaleShows({
        showModel,
        activeMovieIds: movieStats.movieIds,
        now: nowDate,
        region: normalizedRegion,
    });
    const generatedShows = buildGeneratedShows({
        movieIds: movieStats.movieIds,
        now: nowDate,
        days,
        region: normalizedRegion,
        showPrice,
    });
    const showStats = await upsertShows({ showModel, generatedShows });
    await invalidate();

    const summary = {
        event: 'sync-vn-now-playing-shows',
        region: normalizedRegion,
        movies: movieStats.movieIds.length,
        moviesCreated: movieStats.created,
        moviesReused: movieStats.reused,
        showsCreated: showStats.created,
        showsReused: showStats.reused,
        showsClosed,
    };
    logger.info?.(JSON.stringify(summary));
    return { success: true, ...summary };
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
        if (!movieId || seenIds.has(movieId)) continue;
        seenIds.add(movieId);
        movies.push(movie);
    }
    return movies.slice(0, normalizeLimit(limit));
};

export default syncNowPlayingShows;
