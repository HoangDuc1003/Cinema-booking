import { getJson, setJson } from './cacheService.js';
import { redisKeys, redisTtl } from './redisKeys.js';
import { fetchTmdbJson } from './tmdbService.js';

export const MAX_TRAILER_MOVIES = 10;
const YOUTUBE_KEY_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const DEFAULT_LANGUAGES = Object.freeze(['vi', 'en']);
const TRAILER_TYPES = new Set(['Trailer', 'Teaser']);

export const normalizeTrailerMovieIds = (movieIds, limit = MAX_TRAILER_MOVIES) => {
    if (!Array.isArray(movieIds)) return [];
    const seen = new Set();
    const normalized = [];
    for (const candidate of movieIds) {
        const movieId = String(candidate || '').trim();
        if (!/^\d+$/.test(movieId) || seen.has(movieId)) continue;
        seen.add(movieId);
        normalized.push(movieId);
        if (normalized.length >= limit) break;
    }
    return normalized;
};

const normalizeLanguage = (value) => String(value || '').trim().toLowerCase().split('-')[0];

const typeRank = (video) => {
    if (video.type === 'Trailer' && video.official === true) return 4;
    if (video.type === 'Trailer') return 3;
    if (video.type === 'Teaser' && video.official === true) return 2;
    if (video.type === 'Teaser') return 1;
    return 0;
};

const languageRank = (video, preferredLanguages) => {
    const language = normalizeLanguage(video.iso_639_1);
    const index = preferredLanguages.indexOf(language);
    return index < 0 ? 0 : preferredLanguages.length - index;
};

const officialNameRank = (video) => /\bofficial\s+(?:trailer|teaser)\b/i.test(String(video.name || '')) ? 1 : 0;

export const selectBestTmdbTrailer = (videos = [], {
    preferredLanguages = DEFAULT_LANGUAGES,
} = {}) => {
    const languages = preferredLanguages.map(normalizeLanguage).filter(Boolean);
    return videos
        .filter((video) => (
            String(video?.site || '').toLowerCase() === 'youtube'
            && TRAILER_TYPES.has(video?.type)
            && YOUTUBE_KEY_PATTERN.test(String(video?.key || ''))
        ))
        .sort((left, right) => (
            typeRank(right) - typeRank(left)
            || languageRank(right, languages) - languageRank(left, languages)
            || officialNameRank(right) - officialNameRank(left)
            || Date.parse(right.published_at || 0) - Date.parse(left.published_at || 0)
            || String(left.key).localeCompare(String(right.key))
        ))[0] || null;
};

export const normalizeSelectedTrailer = (movieId, video) => {
    if (!video) {
        return {
            movieId: String(movieId),
            available: false,
            provider: null,
            key: null,
            type: null,
            official: false,
            name: null,
            publishedAt: null,
            language: null,
            embedUrl: null,
            thumbnailUrl: null,
        };
    }

    const key = String(video.key);
    return {
        movieId: String(movieId),
        available: true,
        provider: 'youtube',
        key,
        type: video.type,
        official: video.official === true,
        name: String(video.name || `${video.type} trailer`),
        publishedAt: video.published_at || null,
        language: normalizeLanguage(video.iso_639_1) || null,
        embedUrl: `https://www.youtube-nocookie.com/embed/${key}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${key}/hqdefault.jpg`,
    };
};

export const createTmdbTrailerService = ({
    fetchJson = fetchTmdbJson,
    readCache = getJson,
    writeCache = setJson,
    concurrency = 4,
} = {}) => {
    const getMovieTrailer = async (movieId, { preferredLanguages = DEFAULT_LANGUAGES } = {}) => {
        const cacheKey = redisKeys.tmdbSelectedTrailer(movieId);
        const cached = await readCache(cacheKey);
        if (cached?.schemaVersion === 1 && cached?.result?.movieId === String(movieId)) {
            return { ...cached.result, cache: 'hit', status: cached.result.available ? 'available' : 'unavailable' };
        }

        try {
            const payload = await fetchJson(`/movie/${movieId}/videos`, {
                language: 'vi-VN',
                include_video_language: 'vi,en,null',
            });
            const selected = selectBestTmdbTrailer(payload?.results, { preferredLanguages });
            const result = normalizeSelectedTrailer(movieId, selected);
            await writeCache(
                cacheKey,
                { schemaVersion: 1, result },
                result.available ? redisTtl.tmdbTrailer : redisTtl.tmdbTrailerNegative,
            );
            return {
                ...result,
                cache: 'miss',
                status: result.available ? 'available' : 'unavailable',
            };
        } catch (error) {
            return {
                ...normalizeSelectedTrailer(movieId, null),
                cache: 'bypass',
                status: 'error',
                errorCode: error?.code || error?.name || 'TMDB_VIDEO_UNAVAILABLE',
            };
        }
    };

    const getTrailers = async ({ movieIds, preferredLanguages = DEFAULT_LANGUAGES } = {}) => {
        const ids = normalizeTrailerMovieIds(movieIds);
        const results = [];
        const batchSize = Math.max(1, Number.parseInt(concurrency, 10) || 1);
        for (let index = 0; index < ids.length; index += batchSize) {
            const chunk = ids.slice(index, index + batchSize);
            results.push(...await Promise.all(chunk.map(
                (movieId) => getMovieTrailer(movieId, { preferredLanguages }),
            )));
        }
        return {
            results,
            meta: {
                requested: ids.length,
                available: results.filter((result) => result.status === 'available').length,
                unavailable: results.filter((result) => result.status === 'unavailable').length,
                failed: results.filter((result) => result.status === 'error').length,
            },
        };
    };

    return { getMovieTrailer, getTrailers };
};

const tmdbTrailerService = createTmdbTrailerService();

export const getTmdbMovieTrailer = tmdbTrailerService.getMovieTrailer;
export const getTmdbTrailersBatch = tmdbTrailerService.getTrailers;

export default tmdbTrailerService;
