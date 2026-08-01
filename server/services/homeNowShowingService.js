import { createHash } from 'node:crypto';
import { rememberJson } from './cacheService.js';
import { redisKeys, redisTtl } from './redisKeys.js';
import {
    getBookableNowShowingMovies,
    SCHEDULE_DAYS,
    TMDB_REGION,
} from './nowPlayingShowSyncService.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const roundMs = (value) => Math.round(value * 100) / 100;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const parseHomeNowShowingLimit = (value) => {
    const parsed = Number.parseInt(value, 10);
    return clamp(Number.isFinite(parsed) ? parsed : DEFAULT_LIMIT, 1, MAX_LIMIT);
};

export const normalizeHomeNowShowingRegion = (value) => {
    const region = String(value || 'US').trim().toUpperCase();
    return /^[A-Z]{2}$/.test(region) ? region : 'US';
};

export const normalizeHomeNowShowingMovie = (movie) => {
    const id = String(movie?._id || movie?.id || '').trim();
    if (!id) return null;
    return {
        ...movie,
        _id: id,
        id: /^\d+$/.test(id) ? Number(id) : id,
        title: movie.title || movie.name || 'Untitled',
        poster_path: movie.poster_path || null,
        backdrop_path: movie.backdrop_path || null,
        release_date: String(movie.release_date || '').slice(0, 10),
        vote_average: Number(movie.vote_average) || 0,
        runtime: Number.isFinite(Number(movie.runtime)) ? Number(movie.runtime) : null,
    };
};

export const createHomeNowShowingEtag = (value) => {
    const catalog = value?.meta?.catalog || {};
    const identity = JSON.stringify({
        batchId: catalog.batchId || '',
        version: catalog.version ?? '',
        slot: catalog.slot ?? '',
        region: value?.meta?.region || TMDB_REGION,
        limit: value?.meta?.limit || 0,
        movies: (value?.results || []).map((movie) => String(movie?._id || movie?.id || '')),
    });
    const digest = createHash('sha256').update(identity).digest('hex').slice(0, 24);
    return `"home-now-showing-${digest}"`;
};

export const getPublicHomeNowShowing = async ({
    limit: rawLimit = DEFAULT_LIMIT,
    region: rawRegion = TMDB_REGION,
    now = new Date(),
} = {}) => {
    const limit = parseHomeNowShowingLimit(rawLimit);
    const region = normalizeHomeNowShowingRegion(rawRegion);
    const startedAt = performance.now();
    const cacheKey = redisKeys.bookableNowShowing(region, SCHEDULE_DAYS);
    const result = await rememberJson(
        cacheKey,
        redisTtl.movies,
        () => getBookableNowShowingMovies({
            region,
            days: SCHEDULE_DAYS,
            limit: MAX_LIMIT,
            now,
        }),
    );
    const results = (Array.isArray(result.value) ? result.value : [])
        .slice(0, limit)
        .map(normalizeHomeNowShowingMovie)
        .filter(Boolean);

    return {
        value: {
            results,
            meta: {
                region,
                limit,
                source: 'bookable-shows',
                partial: results.length < limit,
                catalog: null,
                generatedAt: now.toISOString(),
            },
        },
        cache: result.cache,
        timing: {
            catalogMs: roundMs(performance.now() - startedAt),
            totalMs: roundMs(performance.now() - startedAt),
        },
    };
};

export default getPublicHomeNowShowing;
