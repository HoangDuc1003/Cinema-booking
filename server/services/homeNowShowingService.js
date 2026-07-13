import axios from 'axios';
import connectDB from '../configs/db.js';
import Movie from '../models/Movie.js';
import { getJson, setJson } from './cacheService.js';
import { redisKeys, redisTtl } from './redisKeys.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const RELEASE_WINDOW_PAST_DAYS = 120;
const RELEASE_WINDOW_FUTURE_DAYS = 7;
const MOVIE_SELECT = [
    '_id',
    'title',
    'overview',
    'poster_path',
    'backdrop_path',
    'release_date',
    'original_language',
    'genres',
    'vote_average',
    'runtime',
    'updatedAt',
].join(' ');

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const asFiniteNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const utcDayStart = (date) => Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
);

const parseReleaseTimestamp = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').slice(0, 10));
    if (!match) return Number.NaN;
    const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const parsed = new Date(timestamp);
    if (
        parsed.getUTCFullYear() !== Number(match[1])
        || parsed.getUTCMonth() !== Number(match[2]) - 1
        || parsed.getUTCDate() !== Number(match[3])
    ) return Number.NaN;
    return timestamp;
};

const hasValue = (value) => value !== undefined
    && value !== null
    && value !== ''
    && (!Array.isArray(value) || value.length > 0);

const mergeMovies = (current, next) => {
    const merged = { ...current };
    for (const [key, value] of Object.entries(next)) {
        if (hasValue(value)) merged[key] = value;
    }
    return merged;
};

export const parseHomeNowShowingLimit = (value) => {
    const parsed = Number.parseInt(value, 10);
    return clamp(Number.isFinite(parsed) ? parsed : DEFAULT_LIMIT, 1, MAX_LIMIT);
};

export const normalizeHomeNowShowingRegion = (value) => {
    const region = String(value || 'US').trim().toUpperCase();
    return /^[A-Z]{2}$/.test(region) ? region : 'US';
};

export const isEligibleHomeNowShowingMovie = (movie, {
    now = new Date(),
    pastWindowDays = RELEASE_WINDOW_PAST_DAYS,
    futureWindowDays = RELEASE_WINDOW_FUTURE_DAYS,
} = {}) => {
    if (!movie || movie.adult === true || !movie.poster_path) return false;

    const releaseTimestamp = parseReleaseTimestamp(movie.release_date);
    if (!Number.isFinite(releaseTimestamp)) return false;

    const today = utcDayStart(now);
    return releaseTimestamp >= today - (pastWindowDays * DAY_MS)
        && releaseTimestamp <= today + (futureWindowDays * DAY_MS);
};

export const normalizeHomeNowShowingMovie = (movie) => {
    const rawId = movie?.id ?? movie?._id;
    const stringId = String(rawId || '').trim();
    if (!stringId) return null;

    const numericId = /^\d+$/.test(stringId) ? Number(stringId) : stringId;
    const genres = Array.isArray(movie.genres) ? movie.genres : [];
    const genreIds = Array.isArray(movie.genre_ids)
        ? movie.genre_ids
        : genres.map((genre) => genre?.id).filter((id) => id !== undefined && id !== null);

    return {
        _id: stringId,
        id: numericId,
        title: movie.title || movie.name || 'Untitled',
        original_title: movie.original_title || movie.original_name || movie.title || movie.name || 'Untitled',
        overview: movie.overview || '',
        poster_path: movie.poster_path || null,
        backdrop_path: movie.backdrop_path || null,
        release_date: String(movie.release_date || '').slice(0, 10),
        original_language: movie.original_language || '',
        adult: movie.adult === true,
        genre_ids: genreIds,
        genres,
        popularity: asFiniteNumber(movie.popularity),
        vote_average: asFiniteNumber(movie.vote_average),
        vote_count: asFiniteNumber(movie.vote_count),
        runtime: Number.isFinite(Number(movie.runtime)) ? Number(movie.runtime) : null,
    };
};

const getFreshnessScore = (releaseTimestamp, now) => {
    const ageDays = (utcDayStart(now) - releaseTimestamp) / DAY_MS;
    if (ageDays < 0) {
        return clamp(1 - ((Math.abs(ageDays) / RELEASE_WINDOW_FUTURE_DAYS) * 0.1), 0, 1);
    }
    return clamp(1 - (ageDays / RELEASE_WINDOW_PAST_DAYS), 0, 1);
};

export const rankHomeNowShowingMovies = ({
    nowPlayingPages = [],
    trendingMovies = [],
    limit = DEFAULT_LIMIT,
    now = new Date(),
} = {}) => {
    const candidates = new Map();

    const addCandidate = (rawMovie, source, rank) => {
        if (!isEligibleHomeNowShowingMovie(rawMovie, { now })) return;
        const movie = normalizeHomeNowShowingMovie(rawMovie);
        if (!movie) return;

        const current = candidates.get(movie._id) || {
            movie,
            nowPlayingRank: null,
            trendingRank: null,
        };
        current.movie = mergeMovies(current.movie, movie);
        if (source === 'now-playing') {
            current.nowPlayingRank = current.nowPlayingRank === null
                ? rank
                : Math.min(current.nowPlayingRank, rank);
        } else {
            current.trendingRank = current.trendingRank === null
                ? rank
                : Math.min(current.trendingRank, rank);
        }
        candidates.set(movie._id, current);
    };

    nowPlayingPages.forEach((movies, pageIndex) => {
        (Array.isArray(movies) ? movies : []).forEach((movie, movieIndex) => {
            addCandidate(movie, 'now-playing', (pageIndex * 20) + movieIndex + 1);
        });
    });
    (Array.isArray(trendingMovies) ? trendingMovies : []).forEach((movie, movieIndex) => {
        addCandidate(movie, 'trending', movieIndex + 1);
    });

    const maxPopularity = Math.max(
        1,
        ...[...candidates.values()].map(({ movie }) => Math.max(0, movie.popularity)),
    );
    const maxPopularityLog = Math.log1p(maxPopularity);

    const ranked = [...candidates.values()].map((candidate) => {
        const { movie, nowPlayingRank, trendingRank } = candidate;
        const nowPlayingScore = nowPlayingRank === null
            ? 0
            : clamp(1 - ((nowPlayingRank - 1) / 40), 0, 1);
        const trendingScore = trendingRank === null
            ? 0
            : clamp(1 - ((trendingRank - 1) / 20), 0, 1);
        const appearsInBoth = nowPlayingRank !== null && trendingRank !== null;
        const sourceHeat = clamp(
            (nowPlayingScore * 0.46) + (trendingScore * 0.54) + (appearsInBoth ? 0.18 : 0),
            0,
            1,
        );
        const freshness = getFreshnessScore(parseReleaseTimestamp(movie.release_date), now);
        const popularity = maxPopularityLog > 0
            ? Math.log1p(Math.max(0, movie.popularity)) / maxPopularityLog
            : 0;
        const voteConfidence = clamp(Math.log10(Math.max(0, movie.vote_count) + 1) / 4, 0, 1);
        const quality = clamp(movie.vote_average / 10, 0, 1) * voteConfidence;

        return {
            movie,
            score: (sourceHeat * 0.42)
                + (freshness * 0.34)
                + (popularity * 0.16)
                + (quality * 0.08),
            releaseTimestamp: parseReleaseTimestamp(movie.release_date),
        };
    });

    ranked.sort((left, right) => (
        right.score - left.score
        || right.releaseTimestamp - left.releaseTimestamp
        || right.movie.popularity - left.movie.popularity
        || left.movie._id.localeCompare(right.movie._id, 'en', { numeric: true })
    ));

    return ranked.slice(0, parseHomeNowShowingLimit(limit)).map(({ movie }) => movie);
};

const fetchTmdbMovieList = async (path, params) => {
    if (!process.env.TMDB_API_KEY) throw new Error('TMDB_API_KEY is not configured');
    const { data } = await axios.get(`https://api.themoviedb.org/3${path}`, {
        headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
        params,
        timeout: Number(process.env.TMDB_TIMEOUT_MS) || 3000,
    });
    return Array.isArray(data?.results) ? data.results : [];
};

export const fetchTmdbHomeNowShowingSources = async ({
    region = 'US',
    fetchList = fetchTmdbMovieList,
} = {}) => {
    const normalizedRegion = normalizeHomeNowShowingRegion(region);
    const requests = [
        {
            name: 'now-playing-page-1',
            bucket: 'nowPlaying',
            pageIndex: 0,
            path: '/movie/now_playing',
            params: { language: 'en-US', region: normalizedRegion, page: 1 },
        },
        {
            name: 'now-playing-page-2',
            bucket: 'nowPlaying',
            pageIndex: 1,
            path: '/movie/now_playing',
            params: { language: 'en-US', region: normalizedRegion, page: 2 },
        },
        {
            name: 'trending-week',
            bucket: 'trending',
            path: '/trending/movie/week',
            params: { language: 'en-US' },
        },
    ];
    const settled = await Promise.allSettled(
        requests.map((request) => fetchList(request.path, request.params)),
    );
    const nowPlayingPages = [[], []];
    let trendingMovies = [];
    const failures = [];
    let nowPlayingSucceeded = 0;
    let trendingSucceeded = 0;

    settled.forEach((result, index) => {
        const request = requests[index];
        if (result.status === 'rejected') {
            failures.push(request.name);
            return;
        }
        if (request.bucket === 'nowPlaying') {
            nowPlayingPages[request.pageIndex] = Array.isArray(result.value) ? result.value : [];
            nowPlayingSucceeded += 1;
        } else {
            trendingMovies = Array.isArray(result.value) ? result.value : [];
            trendingSucceeded += 1;
        }
    });

    return {
        nowPlayingPages,
        trendingMovies,
        failures,
        sources: {
            nowPlaying: { requested: 2, succeeded: nowPlayingSucceeded },
            trending: { requested: 1, succeeded: trendingSucceeded },
        },
    };
};

const getReleaseWindowDates = (now) => {
    const today = utcDayStart(now);
    return {
        earliest: new Date(today - (RELEASE_WINDOW_PAST_DAYS * DAY_MS)).toISOString().slice(0, 10),
        latest: new Date(today + (RELEASE_WINDOW_FUTURE_DAYS * DAY_MS)).toISOString().slice(0, 10),
    };
};

const loadMongoFallbackMovies = async ({ limit, now }) => {
    if (!process.env.MONGODB_URI) return [];
    const { earliest, latest } = getReleaseWindowDates(now);

    try {
        await connectDB();
        const movies = await Movie.find({
            release_date: { $gte: earliest, $lte: latest },
            poster_path: { $nin: [null, ''] },
        })
            .select(MOVIE_SELECT)
            .sort({ release_date: -1, vote_average: -1, updatedAt: -1 })
            .limit(Math.max(limit * 4, 40))
            .lean();

        return rankHomeNowShowingMovies({ nowPlayingPages: [movies], limit, now });
    } catch (error) {
        console.warn('[homeNowShowing] MongoDB fallback unavailable:', error.message);
        return [];
    }
};

const hasMovies = (payload) => Array.isArray(payload?.results) && payload.results.length > 0;

const buildPayload = ({ results, region, limit, source, partial, sources, failures, now }) => ({
    results,
    meta: {
        region,
        limit,
        source,
        partial,
        sources,
        failures,
        generatedAt: now.toISOString(),
    },
});

export const getPublicHomeNowShowing = async ({
    limit: rawLimit = DEFAULT_LIMIT,
    region: rawRegion = process.env.TMDB_REGION || 'US',
    now = new Date(),
} = {}) => {
    const limit = parseHomeNowShowingLimit(rawLimit);
    const region = normalizeHomeNowShowingRegion(rawRegion);
    const cacheKey = redisKeys.homeNowShowing(limit, region);
    const lastGoodKey = redisKeys.homeNowShowingLastGood(limit, region);
    const cached = await getJson(cacheKey);
    if (hasMovies(cached)) return { value: cached, cache: 'hit' };

    let remoteSources;
    try {
        remoteSources = await fetchTmdbHomeNowShowingSources({ region });
    } catch (error) {
        console.warn('[homeNowShowing] TMDB sources unavailable:', error.message);
        remoteSources = {
            nowPlayingPages: [[], []],
            trendingMovies: [],
            failures: ['now-playing-page-1', 'now-playing-page-2', 'trending-week'],
            sources: {
                nowPlaying: { requested: 2, succeeded: 0 },
                trending: { requested: 1, succeeded: 0 },
            },
        };
    }

    const remoteMovies = rankHomeNowShowingMovies({
        nowPlayingPages: remoteSources.nowPlayingPages,
        trendingMovies: remoteSources.trendingMovies,
        limit,
        now,
    });
    if (remoteMovies.length) {
        const payload = buildPayload({
            results: remoteMovies,
            region,
            limit,
            source: 'tmdb',
            partial: remoteSources.failures.length > 0,
            sources: remoteSources.sources,
            failures: remoteSources.failures,
            now,
        });
        await Promise.all([
            setJson(cacheKey, payload, redisTtl.movies),
            setJson(lastGoodKey, payload, redisTtl.homeNowShowingLastGood),
        ]);
        return { value: payload, cache: 'miss' };
    }

    const lastGood = await getJson(lastGoodKey);
    if (hasMovies(lastGood)) {
        const payload = {
            ...lastGood,
            results: lastGood.results.slice(0, limit),
            meta: {
                ...lastGood.meta,
                region,
                limit,
                source: 'last-good',
                partial: true,
                stale: true,
                failures: remoteSources.failures,
                servedAt: now.toISOString(),
            },
        };
        return { value: payload, cache: 'stale' };
    }

    const mongoMovies = await loadMongoFallbackMovies({ limit, now });
    if (mongoMovies.length) {
        const payload = buildPayload({
            results: mongoMovies,
            region,
            limit,
            source: 'mongodb',
            partial: true,
            sources: remoteSources.sources,
            failures: remoteSources.failures,
            now,
        });
        await setJson(cacheKey, payload, redisTtl.movies);
        return { value: payload, cache: 'fallback' };
    }

    return {
        value: buildPayload({
            results: [],
            region,
            limit,
            source: 'empty',
            partial: true,
            sources: remoteSources.sources,
            failures: remoteSources.failures,
            now,
        }),
        cache: 'bypass',
    };
};

export default getPublicHomeNowShowing;
