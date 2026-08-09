import { createHash } from 'node:crypto';
import { getJson, setJson } from './cacheService.js';
import { redisKeys, redisTtl } from './redisKeys.js';
import { fetchTmdbJson } from './tmdbService.js';
import { TMDB_LANGUAGE, TMDB_REGION } from './nowPlayingShowSyncService.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const TMDB_PAGES = Object.freeze([1, 2]);
const roundMs = (value) => Math.round(value * 100) / 100;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const parseHomeNowShowingLimit = (value) => {
    const parsed = Number.parseInt(value, 10);
    return clamp(Number.isFinite(parsed) ? parsed : DEFAULT_LIMIT, 1, MAX_LIMIT);
};

export const normalizeHomeNowShowingRegion = () => TMDB_REGION;

const finiteNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

export const normalizeHomeNowShowingMovie = (movie) => {
    if (!movie || movie.adult === true) return null;
    const id = String(movie.id ?? movie._id ?? '').trim();
    const title = String(movie.title || movie.name || '').trim();
    const posterPath = String(movie.poster_path || '').trim() || null;
    const backdropPath = String(movie.backdrop_path || '').trim() || null;
    const releaseDate = String(movie.release_date || '').slice(0, 10);
    const numericId = Number(id);
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(numericId) || numericId <= 0) return null;
    if (!title || (!posterPath && !backdropPath)) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) return null;

    return {
        ...movie,
        _id: id,
        id: numericId,
        title,
        poster_path: posterPath,
        backdrop_path: backdropPath,
        release_date: releaseDate,
        popularity: finiteNumber(movie.popularity),
        vote_count: finiteNumber(movie.vote_count),
        vote_average: finiteNumber(movie.vote_average),
        runtime: Number(movie.runtime) > 0 ? Number(movie.runtime) : null,
        adult: false,
    };
};

export const rankHomeNowShowingMovies = (movies = [], limit = MAX_LIMIT) => {
    const seen = new Set();
    return movies
        .map(normalizeHomeNowShowingMovie)
        .filter(Boolean)
        .sort((left, right) => (
            right.popularity - left.popularity
            || right.vote_count - left.vote_count
            || right.vote_average - left.vote_average
            || String(left._id).localeCompare(String(right._id), 'en', { numeric: true })
        ))
        .filter((movie) => {
            if (seen.has(movie._id)) return false;
            seen.add(movie._id);
            return true;
        })
        .slice(0, parseHomeNowShowingLimit(limit));
};

const isCachedMovieList = (value) => (
    Array.isArray(value?.results)
    && value.results.length > 0
    && value.results.every((movie) => normalizeHomeNowShowingMovie(movie))
);

const makeValue = ({ cached, limit, now, region, source, stale }) => ({
    results: cached.results.slice(0, limit),
    meta: {
        source,
        region,
        limit,
        stale,
        partial: cached.results.length < limit,
        fetchedPages: cached.fetchedPages || 0,
        generatedAt: cached.generatedAt || now.toISOString(),
    },
});

export const createHomeNowShowingService = ({
    fetchJson = fetchTmdbJson,
    readCache = getJson,
    writeCache = setJson,
} = {}) => async ({
    limit: rawLimit = DEFAULT_LIMIT,
    region: rawRegion = TMDB_REGION,
    now = new Date(),
} = {}) => {
    const limit = parseHomeNowShowingLimit(rawLimit);
    const region = normalizeHomeNowShowingRegion(rawRegion);
    const startedAt = performance.now();
    const freshKey = redisKeys.homeTmdbNowPlaying(region);
    const lastGoodKey = redisKeys.homeTmdbNowPlayingLastGood(region);
    const fresh = await readCache(freshKey);

    if (isCachedMovieList(fresh)) {
        return {
            value: makeValue({
                cached: fresh,
                limit,
                now,
                region,
                source: 'tmdb-now-playing',
                stale: false,
            }),
            cache: 'hit',
            timing: {
                upstreamMs: 0,
                totalMs: roundMs(performance.now() - startedAt),
            },
        };
    }

    try {
        const pageResponses = await Promise.allSettled(TMDB_PAGES.map((page) => fetchJson(
            '/movie/now_playing',
            {
                region,
                language: TMDB_LANGUAGE,
                include_adult: false,
                page,
            },
        )));
        if (pageResponses[0]?.status !== 'fulfilled') {
            throw pageResponses[0]?.reason || new Error('TMDB now-playing page one is unavailable');
        }
        const fulfilled = pageResponses.filter((result) => result.status === 'fulfilled');

        const ranked = rankHomeNowShowingMovies(
            fulfilled.flatMap((result) => (
                Array.isArray(result.value?.results) ? result.value.results : []
            )),
            MAX_LIMIT,
        );
        if (!ranked.length) {
            throw Object.assign(new Error('TMDB returned no valid now-playing movies'), {
                code: 'TMDB_EMPTY_RESPONSE',
            });
        }

        const cached = {
            results: ranked,
            fetchedPages: fulfilled.length,
            generatedAt: now.toISOString(),
        };
        await Promise.all([
            writeCache(freshKey, cached, redisTtl.movies),
            writeCache(lastGoodKey, cached, redisTtl.homeNowShowingLastGood),
        ]);

        return {
            value: makeValue({
                cached,
                limit,
                now,
                region,
                source: 'tmdb-now-playing',
                stale: false,
            }),
            cache: 'miss',
            timing: {
                upstreamMs: roundMs(performance.now() - startedAt),
                totalMs: roundMs(performance.now() - startedAt),
            },
        };
    } catch (error) {
        const lastGood = await readCache(lastGoodKey);
        if (isCachedMovieList(lastGood)) {
            return {
                value: makeValue({
                    cached: lastGood,
                    limit,
                    now,
                    region,
                    source: 'tmdb-now-playing-last-good',
                    stale: true,
                }),
                cache: 'stale',
                timing: {
                    upstreamMs: roundMs(performance.now() - startedAt),
                    totalMs: roundMs(performance.now() - startedAt),
                },
            };
        }
        throw Object.assign(new Error('TMDB now-playing is unavailable and no last-good cache exists', {
            cause: error,
        }), {
            code: error?.code === 'INVALID_CONFIGURATION' ? error.code : 'TMDB_UNAVAILABLE',
            statusCode: 503,
        });
    }
};

export const createHomeNowShowingEtag = (value) => {
    const identity = JSON.stringify({
        source: value?.meta?.source || '',
        region: value?.meta?.region || TMDB_REGION,
        limit: value?.meta?.limit || 0,
        movies: (value?.results || []).map((movie) => ({
            id: String(movie?._id || movie?.id || ''),
            popularity: finiteNumber(movie?.popularity),
        })),
    });
    const digest = createHash('sha256').update(identity).digest('hex').slice(0, 24);
    return `"home-now-showing-${digest}"`;
};

export const getPublicHomeNowShowing = createHomeNowShowingService();

export default getPublicHomeNowShowing;
