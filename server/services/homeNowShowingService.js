import Movie from '../models/Movie.js';
import { getPublicHomePayload } from './catalogRefreshService.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

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

const loadMongoFallback = async (limit) => {
    const movies = await Movie.find({ poster_path: { $nin: [null, ''] } })
        .sort({ release_date: -1, vote_average: -1, updatedAt: -1 })
        .limit(limit)
        .lean();
    return movies.map(normalizeHomeNowShowingMovie).filter(Boolean);
};

export const getPublicHomeNowShowing = async ({
    limit: rawLimit = DEFAULT_LIMIT,
    region: rawRegion = 'US',
    now = new Date(),
} = {}) => {
    const limit = parseHomeNowShowingLimit(rawLimit);
    const region = normalizeHomeNowShowingRegion(rawRegion);
    try {
        const payload = await getPublicHomePayload(limit, region, now);
        let results = (payload.nowShowing || []).slice(0, limit).map(normalizeHomeNowShowingMovie).filter(Boolean);
        let source = 'weekly-catalog';
        if (!results.length) {
            results = await loadMongoFallback(limit);
            source = 'mongodb';
        }
        return {
            value: {
                results,
                meta: {
                    region,
                    limit,
                    source,
                    partial: results.length < limit,
                    catalog: payload.meta || null,
                    generatedAt: now.toISOString(),
                },
            },
            cache: source === 'weekly-catalog' ? 'catalog' : 'bypass',
        };
    } catch (error) {
        const results = await loadMongoFallback(limit).catch(() => []);
        return {
            value: {
                results,
                meta: {
                    region,
                    limit,
                    source: results.length ? 'mongodb' : 'empty',
                    partial: true,
                    failures: [error.code || 'CATALOG_UNAVAILABLE'],
                    generatedAt: now.toISOString(),
                },
            },
            cache: 'bypass',
        };
    }
};

export default getPublicHomeNowShowing;
