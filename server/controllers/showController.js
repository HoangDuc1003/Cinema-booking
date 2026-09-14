import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import { importTrendingMoviesLogic } from '../services/movieService.js';
import { deleteKeys, getJson, rememberJson, setJson } from '../services/cacheService.js';
import { invalidateMovieCatalog } from '../services/cacheInvalidationService.js';
import { redisKeys, redisTtl } from '../services/redisKeys.js';
import { createHeroEtag, getPublicHomeHero, matchesHeroEtag } from '../services/heroService.js';
import {
    createHomeNowShowingEtag,
    getPublicHomeNowShowing,
} from '../services/homeNowShowingService.js';
import { fetchTmdbImage } from '../services/tmdbImageService.js';
import { fetchTmdbJson } from '../services/tmdbService.js';
import {
    getTmdbTrailersBatch,
    MAX_TRAILER_MOVIES,
    normalizeTrailerMovieIds,
} from '../services/tmdbTrailerService.js';
import { calculateCurrentSlot, getPublicHomePayload } from '../services/catalogRefreshService.js';
import { groupPersistedShowtimes, parseCinemaShowDateTime } from '../services/showtimeService.js';
import { requestIdFor } from '../middleware/requestContext.js';
import { LockBusyError } from '../services/lockService.js';
import { isScheduledMovie } from '../services/scheduleMovieService.js';
import {
    DEFAULT_TITLE_LANGUAGE,
    languageForCountry,
    localizeMovieTitles,
    resolveViewerCountry,
} from '../services/movieTitleService.js';
import {
    getBookableNowShowingMovies,
    ensureScheduledShowtimes,
    isGeneratedScheduleKey,
    isShowtimeGenerationEnabled,
    SCHEDULE_DAYS,
    SHOWS_PER_DAY,
    TMDB_REGION,
    syncNowPlayingShows,
} from '../services/nowPlayingShowSyncService.js';

const setCacheHeader = (res, cache) => res.set('X-Cache', cache);
const HOME_BROWSER_CACHE_CONTROL = 'public, max-age=60, stale-if-error=86400';
const HOME_CDN_CACHE_CONTROL = 's-maxage=300, stale-while-revalidate=43200, stale-if-error=86400';

const setTimingHeader = (res, timing = {}) => {
    const entries = [
        ['db', timing.dbConnectMs],
        ['indexes', timing.indexVerificationMs],
        ['redis', timing.redisMs],
        ['catalog', timing.catalogMs],
        ['total', timing.totalMs],
    ].filter(([, value]) => Number.isFinite(value));
    if (entries.length) res.set('Server-Timing', entries.map(([name, value]) => `${name};dur=${Number(value).toFixed(2)}`).join(', '));
};

const parsePage = (value) => Math.min(Math.max(Number.parseInt(value, 10) || 1, 1), 500);
const validMovieId = (value) => /^\d+$/.test(String(value));
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toTmdbMovie = (movie) => ({
    ...movie,
    id: movie.id || movie._id,
    credits: movie.credits || { cast: movie.casts || [] },
});

const loadDatabaseMovies = async ({ query = null, limit = 20 } = {}) => {
    const filter = query ? { title: { $regex: escapeRegex(query), $options: 'i' } } : {};
    const movies = await Movie.find(filter).sort({ updatedAt: -1 }).limit(limit).lean();
    return { page: 1, total_pages: 1, total_results: movies.length, results: movies.map(toTmdbMovie) };
};

const withMovieFallback = async (label, remoteLoader, fallbackLoader = loadDatabaseMovies) => {
    try {
        return await remoteLoader();
    } catch (error) {
        console.warn(`[${label}] TMDB unavailable, using MongoDB fallback:`, error.message);
        return fallbackLoader();
    }
};

const sendTmdbResponse = async (res, key, ttl, loader) => {
    const result = await rememberJson(key, ttl, loader);
    return setCacheHeader(res, result.cache).json({ success: true, data: result.value });
};

export const getTmdbPopular = async (req, res) => {
    try {
        const page = parsePage(req.query.page);
        return await sendTmdbResponse(
            res,
            redisKeys.tmdbPopular(page),
            redisTtl.movies,
            () => withMovieFallback(
                'getTmdbPopular',
                () => fetchTmdbJson('/movie/popular', { language: 'en-US', include_adult: false, page }),
            ),
        );
    } catch (error) {
        console.error('[getTmdbPopular]', error.message);
        return res.status(502).json({ success: false, message: 'Unable to load popular movies.' });
    }
};
// Titles follow the viewer country, so the same line-up has one ETag per language
// and shared caches keep one copy per country.
const TITLE_VARY = 'Origin, X-Vercel-IP-Country';
const etagForLanguage = (etag, language) => (
    language === DEFAULT_TITLE_LANGUAGE ? etag : etag.replace(/"$/, `.${language}"`)
);

export const createGetHomeHeroHandler = ({
    loadHero = getPublicHomeHero,
    makeEtag = createHeroEtag,
    etagMatches = matchesHeroEtag,
    localizeTitles = localizeMovieTitles,
} = {}) => async (req, res) => {
    try {
        const payload = await loadHero();
        const titleLanguage = languageForCountry(resolveViewerCountry(req));
        const etag = etagForLanguage(makeEtag(payload), titleLanguage);
        res.set('ETag', etag);
        // One line-up for everyone, so the CDN may hold it. Stale serving is kept
        // short so the midnight rotation is not masked for a whole day.
        res.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
        res.set('Vary', TITLE_VARY);
        res.set('Content-Language', titleLanguage);
        setCacheHeader(res, payload.cache);
        if (etagMatches(req.get('if-none-match'), etag)) {
            return res.status(304).end();
        }
        const movies = await localizeTitles(payload.movies, titleLanguage);
        return res.json({
            success: true,
            version: payload.version,
            batchId: payload.batchId,
            batchKey: payload.batchKey,
            generatedAt: payload.generatedAt,
            nextRefreshAt: payload.nextRefreshAt,
            timezone: payload.timezone,
            settings: payload.settings,
            movies,
            rotation: payload.rotation,
            meta: { ...payload.meta, titleLanguage },
            cache: payload.cache,
        });
    } catch (error) {
        console.error('[getHomeHero]', error.message);
        return res.status(500).json({ success: false, message: 'Unable to load home hero.' });
    }
};

export const createGetHomeNowShowingHandler = ({
    loadHome = getPublicHomeNowShowing,
    makeEtag = createHomeNowShowingEtag,
    etagMatches = matchesHeroEtag,
    localizeTitles = localizeMovieTitles,
} = {}) => async (req, res) => {
    const requestId = requestIdFor(req);
    const startedAt = performance.now();
    res.set('X-Request-Id', requestId);

    try {
        const result = await loadHome({
            limit: req.query.limit,
            region: req.query.region,
        });
        const value = result?.value;
        const timing = {
            ...(req.nitroTiming || {}),
            ...(result?.timing || {}),
            totalMs: performance.now() - startedAt,
        };

        if (!Array.isArray(value?.results) || !value.results.length) {
            res.set('Cache-Control', 'private, no-store');
            setTimingHeader(res, timing);
            console.warn(JSON.stringify({
                event: 'home-now-showing-unavailable',
            requestId,
            totalMs: Number(timing.totalMs.toFixed(2)),
            dbConnectionState: timing.dbConnectionState,
            source: value?.meta?.source || 'empty',
                cache: 'bypass',
            }));
            return res.status(503).json({
                success: false,
                code: 'NOW_SHOWING_UNAVAILABLE',
                requestId,
                message: 'Home now-showing movies are temporarily unavailable.',
            });
        }

        const titleLanguage = languageForCountry(resolveViewerCountry(req));
        const etag = etagForLanguage(makeEtag(value), titleLanguage);
        const catalog = value.meta?.catalog || {};
        res.set('ETag', etag);
        res.set('Cache-Control', HOME_BROWSER_CACHE_CONTROL);
        res.set('Vercel-CDN-Cache-Control', HOME_CDN_CACHE_CONTROL);
        res.set('Vary', TITLE_VARY);
        res.set('Content-Language', titleLanguage);
        setCacheHeader(res, result.cache || 'bypass');
        res.set('X-Data-Source', value.meta?.source || 'unknown');
        res.set('X-Catalog-Version', String(catalog.version ?? ''));
        res.set('X-Catalog-Slot', String(catalog.slot ?? ''));
        setTimingHeader(res, timing);

        if (etagMatches(req.get?.('if-none-match'), etag)) {
            console.info(JSON.stringify({
                event: 'home-now-showing',
                requestId,
                totalMs: Number(timing.totalMs.toFixed(2)),
                source: value.meta?.source || 'unknown',
                cache: result.cache || 'bypass',
                status: 304,
            }));
            return res.status(304).end();
        }

        console.info(JSON.stringify({
            event: 'home-now-showing',
            requestId,
            totalMs: Number(timing.totalMs.toFixed(2)),
            dbConnectMs: timing.dbConnectMs,
            indexVerificationMs: timing.indexVerificationMs,
            dbConnectionState: timing.dbConnectionState,
            redisMs: timing.redisMs,
            catalogMs: timing.catalogMs,
            source: value.meta?.source || 'unknown',
            cache: result.cache || 'bypass',
            status: 200,
        }));
        const results = await localizeTitles(value.results, titleLanguage);
        return res.json({ success: true, data: { ...value, results, meta: { ...value.meta, titleLanguage } } });
    } catch (error) {
        const timing = { ...(req.nitroTiming || {}), totalMs: performance.now() - startedAt };
        res.set('Cache-Control', 'private, no-store');
        setTimingHeader(res, timing);
        console.error(JSON.stringify({
            event: 'home-now-showing-error',
            requestId,
            totalMs: Number(timing.totalMs.toFixed(2)),
            dbConnectionState: timing.dbConnectionState,
            errorCode: error?.code || error?.name || 'UNKNOWN',
        }));
        const unavailableCodes = new Set([
            'DATABASE_UNAVAILABLE',
            'DATABASE_INDEX_UNAVAILABLE',
            'TMDB_UNAVAILABLE',
            'TMDB_EMPTY_RESPONSE',
            'INVALID_CONFIGURATION',
        ]);
        const code = unavailableCodes.has(error?.code)
            ? (String(error.code).startsWith('DATABASE') ? 'DATABASE_UNAVAILABLE' : 'TMDB_UNAVAILABLE')
            : 'INTERNAL_ERROR';
        return res.status(code === 'INTERNAL_ERROR' ? 500 : 503).json({
            success: false,
            code,
            requestId,
            message: code === 'TMDB_UNAVAILABLE'
                ? 'Current theatrical releases are temporarily unavailable.'
                : code === 'DATABASE_UNAVAILABLE'
                    ? 'Database temporarily unavailable. Please retry.'
                : 'Unable to load home now-showing movies.',
        });
    }
};

export const getTmdbHomeNowShowing = createGetHomeNowShowingHandler();

export const syncNowPlayingShowsAdmin = async (req, res) => {
    try {
        const result = await syncNowPlayingShows({ requestedBy: req.auth?.()?.userId || 'admin' });
        if (!result.success && result.skipped) {
            return res.status(503).json({
                success: false,
                code: result.code || 'SCHEDULE_EMPTY',
                message: 'Neither the Hero nor Now Showing had movies to schedule. Existing schedules were preserved.',
                summary: result,
            });
        }
        return res.json({ success: true, summary: result });
    } catch (error) {
        const status = error?.statusCode === 409 ? 409 : 503;
        return res.status(status).json({
            success: false,
            code: error?.code || 'TMDB_UNAVAILABLE',
            message: status === 409 ? 'A now-playing sync is already running.' : 'Now-playing sync failed. Existing schedules were preserved.',
        });
    }
};

export const getTmdbImage = async (req, res) => {
    try {
        const image = await fetchTmdbImage({
            path: req.query.path,
            size: req.query.size,
        });
        return res
            .set('Content-Type', image.contentType)
            .set('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000')
            .set('Content-Length', String(image.body.length))
            .send(image.body);
    } catch (error) {
        const status = error.status === 400 ? 400 : 502;
        console.warn('[getTmdbImage]', error.message);
        return res.status(status).json({
            success: false,
            message: status === 400 ? 'Invalid image request.' : 'Unable to load movie image.',
        });
    }
};

export const getTmdbUpcoming = async (req, res) => {
    try {
        const page = parsePage(req.query.page);
        return await sendTmdbResponse(
            res,
            redisKeys.tmdbUpcoming(page),
            redisTtl.movies,
            () => withMovieFallback(
                'getTmdbUpcoming',
                () => fetchTmdbJson('/movie/upcoming', { language: 'en-US', page }),
            ),
        );
    } catch (error) {
        console.error('[getTmdbUpcoming]', error.message);
        return res.status(502).json({ success: false, message: 'Unable to load upcoming movies.' });
    }
};

export const getTmdbNowPlaying = async (req, res) => {
    try {
        const page = parsePage(req.query.page);
        return await sendTmdbResponse(
            res,
            redisKeys.tmdbNowPlaying(page),
            redisTtl.movies,
            () => withMovieFallback(
                'getTmdbNowPlaying',
                () => fetchTmdbJson('/movie/now_playing', { region: TMDB_REGION, language: 'vi-VN', page }),
            ),
        );
    } catch (error) {
        console.error('[getTmdbNowPlaying]', error.message);
        return res.status(502).json({ success: false, message: 'Unable to load now-playing movies.' });
    }
};

export const getTmdbMovie = async (req, res) => {
    try {
        const movieId = String(req.params.movieId || '');
        if (!validMovieId(movieId)) return res.status(400).json({ success: false, message: 'Invalid movie ID.' });
        return await sendTmdbResponse(
            res,
            redisKeys.tmdbMovie(movieId),
            redisTtl.movie,
            () => withMovieFallback(
                'getTmdbMovie',
                () => fetchTmdbJson(`/movie/${movieId}`, { language: 'en-US', append_to_response: 'credits' }),
                async () => {
                    const movie = await Movie.findById(movieId).lean();
                    if (!movie) throw new Error('Movie not found in fallback database');
                    return toTmdbMovie(movie);
                },
            ),
        );
    } catch (error) {
        console.error('[getTmdbMovie]', error.message);
        return res.status(502).json({ success: false, message: 'Unable to load movie details.' });
    }
};

export const createGetTmdbVideosHandler = ({
    fetchJson = fetchTmdbJson,
    sendResponse = sendTmdbResponse,
    videosKey = redisKeys.tmdbVideos,
    ttl = redisTtl.movie,
} = {}) => async (req, res) => {
    try {
        const movieId = String(req.params.movieId || '');
        if (!validMovieId(movieId)) return res.status(400).json({ success: false, message: 'Invalid movie ID.' });
        return await sendResponse(
            res,
            videosKey(movieId),
            ttl,
            () => fetchJson(`/movie/${movieId}/videos`, { language: 'en-US' }),
        );
    } catch (error) {
        console.error('[getTmdbVideos]', error.message);
        return res.status(502).json({ success: false, message: 'Unable to load movie videos.' });
    }
};

export const getTmdbVideos = createGetTmdbVideosHandler();

export const createGetTmdbTrailersBatchHandler = ({
    loadTrailers = getTmdbTrailersBatch,
} = {}) => async (req, res) => {
    const requestedIds = req.body?.movieIds;
    if (!Array.isArray(requestedIds) || requestedIds.length === 0 || requestedIds.length > MAX_TRAILER_MOVIES) {
        return res.status(400).json({
            success: false,
            message: `movieIds must contain between 1 and ${MAX_TRAILER_MOVIES} TMDB IDs.`,
        });
    }
    const movieIds = normalizeTrailerMovieIds(requestedIds);
    if (!movieIds.length || movieIds.length !== new Set(requestedIds.map((id) => String(id).trim())).size) {
        return res.status(400).json({
            success: false,
            message: 'movieIds must contain numeric TMDB IDs.',
        });
    }

    try {
        const data = await loadTrailers({ movieIds });
        return res.json({ success: true, data });
    } catch (error) {
        console.error('[getTmdbTrailersBatch]', error?.code || error?.name || 'UNKNOWN');
        return res.status(502).json({
            success: false,
            message: 'Unable to load movie trailers.',
        });
    }
};

export const postTmdbTrailers = createGetTmdbTrailersBatchHandler();

const loadBookableMovieIds = async () => Show.distinct('movie', {
    showDateTime: { $gte: new Date() },
    hall: { $ne: 'Virtual Hall' },
});

const loadSimilarMovieFallback = async (movieId, limit = 20) => {
    const currentMovie = await Movie.findById(movieId).lean();
    const genreIds = (currentMovie?.genres || [])
        .map((genre) => genre?.id)
        .filter(Number.isFinite);
    const baseFilter = {
        _id: { $ne: movieId },
        poster_path: { $nin: [null, ''] },
    };
    const genreFilter = genreIds.length
        ? { ...baseFilter, 'genres.id': { $in: genreIds } }
        : baseFilter;
    let movies = await Movie.find(genreFilter).sort({ vote_average: -1, updatedAt: -1 }).limit(limit).lean();
    if (!movies.length && genreIds.length) {
        movies = await Movie.find(baseFilter).sort({ vote_average: -1, updatedAt: -1 }).limit(limit).lean();
    }
    return {
        page: 1,
        total_pages: 1,
        total_results: movies.length,
        results: movies.map(toTmdbMovie),
    };
};

export const normalizeSimilarMovieResults = ({
    results = [],
    movieId,
    bookableMovieIds = [],
    limit = 4,
}) => {
    const currentMovieId = String(movieId);
    const bookableIds = new Set(bookableMovieIds.map(String));
    const seen = new Set([currentMovieId]);

    return results
        .map((movie, index) => ({ movie, index }))
        .filter(({ movie }) => {
            const id = String(movie?.id || movie?._id || '');
            if (!/^\d+$/.test(id) || seen.has(id) || movie?.adult === true) return false;
            if (!movie?.poster_path && !movie?.backdrop_path) return false;
            seen.add(id);
            return true;
        })
        .map(({ movie, index }) => {
            const id = String(movie.id || movie._id);
            return {
                ...movie,
                id: Number(id),
                _id: id,
                hasShowtimes: bookableIds.has(id),
                __sourceIndex: index,
            };
        })
        .sort((left, right) => (
            Number(right.hasShowtimes) - Number(left.hasShowtimes)
            || left.__sourceIndex - right.__sourceIndex
        ))
        .slice(0, limit)
        .map(({ __sourceIndex, ...movie }) => movie);
};

export const createGetTmdbSimilarHandler = ({
    fetchJson = fetchTmdbJson,
    sendResponse = sendTmdbResponse,
    similarKey = redisKeys.tmdbSimilar,
    ttl = redisTtl.movies,
    loadBookableIds = loadBookableMovieIds,
    loadFallback = loadSimilarMovieFallback,
} = {}) => async (req, res) => {
    try {
        const movieId = String(req.params.movieId || '');
        if (!validMovieId(movieId)) {
            return res.status(400).json({ success: false, message: 'Invalid movie ID.' });
        }
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 4, 1), 20);
        return await sendResponse(
            res,
            similarKey(movieId, limit),
            ttl,
            async () => {
                const [payload, bookableMovieIds] = await Promise.all([
                    withMovieFallback(
                        'getTmdbSimilar',
                        () => fetchJson(`/movie/${movieId}/similar`, {
                            language: 'en-US',
                            include_adult: false,
                            page: 1,
                        }),
                        () => loadFallback(movieId, 20),
                    ),
                    loadBookableIds(),
                ]);
                const results = normalizeSimilarMovieResults({
                    results: payload?.results,
                    movieId,
                    bookableMovieIds,
                    limit,
                });
                return {
                    page: 1,
                    total_pages: 1,
                    total_results: results.length,
                    results,
                };
            },
        );
    } catch (error) {
        console.error('[getTmdbSimilar]', error.message);
        return res.status(502).json({ success: false, message: 'Unable to load similar movies.' });
    }
};

export const getHomeHero = createGetHomeHeroHandler();

export const getTmdbSimilar = createGetTmdbSimilarHandler();

export const searchTmdbMovies = async (req, res) => {
    try {
        const query = String(req.query.query || '').trim().slice(0, 100);
        if (query.length < 2) return res.status(400).json({ success: false, message: 'Search query is too short.' });
        const page = parsePage(req.query.page);
        return await sendTmdbResponse(
            res,
            redisKeys.tmdbSearch(query, page),
            redisTtl.showtimes,
            () => withMovieFallback(
                'searchTmdbMovies',
                () => fetchTmdbJson('/search/movie', { query, language: 'en-US', include_adult: false, page }),
                () => loadDatabaseMovies({ query }),
            ),
        );
    } catch (error) {
        console.error('[searchTmdbMovies]', error.message);
        return res.status(502).json({ success: false, message: 'Unable to search movies.' });
    }
};

export const getTmdbTrailers = async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 20);
        let payload;
        try {
            payload = await getPublicHomePayload(limit, 'US', new Date());
        } catch {
            const movies = await Movie.find({ poster_path: { $nin: [null, ''] } })
                .sort({ updatedAt: -1 })
                .limit(limit)
                .lean();
            payload = { nowShowing: movies, popular: [], recommended: [], meta: null };
        }
        const candidates = [
            ...(payload.nowShowing || []),
            ...(payload.popular || []),
            ...(payload.recommended || []),
        ].slice(0, limit).map((movie) => ({
            id: movie.id || movie._id,
            _id: movie._id || movie.id,
            title: movie.title,
            overview: movie.overview,
            release_date: movie.release_date,
            vote_average: movie.vote_average,
            poster_path: movie.poster_path?.startsWith('http') ? movie.poster_path : (movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null),
            backdrop_path: movie.backdrop_path?.startsWith('http') ? movie.backdrop_path : (movie.backdrop_path ? `https://image.tmdb.org/t/p/w780${movie.backdrop_path}` : null),
            qualityLabel: 'HD',
        }));
        const batchId = payload.meta?.batchId || 'fallback';
        const slot = payload.meta?.slot ?? calculateCurrentSlot(new Date());
        return await sendTmdbResponse(
            res,
            redisKeys.tmdbTrailers(batchId, slot, limit),
            redisTtl.movies,
            async () => candidates,
        );
    } catch (error) {
        console.error('[getTmdbTrailers]', error.message);
        return res.status(500).json({ success: false, message: 'Unable to load trailers.' });
    }
};

const fetchMovieFromTmdb = async (movieId) => {
    const [details, credits] = await Promise.all([
        fetchTmdbJson(`/movie/${movieId}`),
        fetchTmdbJson(`/movie/${movieId}/credits`),
    ]);

    return {
        _id: String(movieId),
        title: details.title,
        overview: details.overview,
        poster_path: details.poster_path,
        backdrop_path: details.backdrop_path,
        genres: details.genres,
        casts: credits.cast,
        release_date: details.release_date,
        original_language: details.original_language,
        tagline: details.tagline || '',
        vote_average: details.vote_average,
        runtime: details.runtime,
    };
};

export const getNowPlayingMovies = async (req, res) => {
    try {
        const result = await rememberJson(redisKeys.nowPlayingMovies(), redisTtl.movies, async () => {
            const data = await fetchTmdbJson('/movie/now_playing');
            return data.results;
        });
        setCacheHeader(res, result.cache).json({ success: true, movies: result.value });
    } catch (error) {
        console.error('[getNowPlayingMovies]', error.message);
        return res.status(500).json({ success: false, message: 'Unable to load movies.' });
    }
};

export const addShow = async (req, res) => {
    try {
        const { movieId, showInput, showPrice } = req.body;
        if (!movieId || !Array.isArray(showInput) || !Number.isFinite(Number(showPrice))) {
            return res.status(400).json({ success: false, message: 'Invalid show input.' });
        }

        let movie = await Movie.findById(String(movieId));
        if (!movie) {
            const movieDetails = await fetchMovieFromTmdb(movieId);
            movie = await Movie.findOneAndUpdate(
                { _id: String(movieId) },
                { $setOnInsert: movieDetails },
                { new: true, upsert: true },
            );
        }

        const showsToCreate = [];
        for (const show of showInput) {
            for (const time of show.times || []) {
                showsToCreate.push({
                    movie: String(movieId),
                    showDateTime: parseCinemaShowDateTime(show.date, time),
                    showPrice: Number(showPrice),
                    hall: show.hall || '',
                    occupiedSeats: {},
                });
            }
        }

        if (!showsToCreate.length) {
            return res.status(400).json({ success: false, message: 'At least one valid showtime is required.' });
        }
        await Show.insertMany(showsToCreate, { ordered: false });
        await invalidateMovieCatalog(String(movieId));
        return res.json({ success: true, message: 'Show added successfully.' });
    } catch (error) {
        console.error('[addShow]', error.message);
        const status = error instanceof RangeError ? 400 : error?.code === 11000 ? 409 : 500;
        return res.status(status).json({
            success: false,
            message: status === 400
                ? error.message
                : status === 409
                    ? 'One or more showtimes already exist.'
                    : 'Unable to add shows.',
        });
    }
};

export const importTrendingMovies = async (req, res) => {
    try {
        const result = await importTrendingMoviesLogic();
        return res.json({ success: true, message: `Successfully imported ${result.count} movies.` });
    } catch (error) {
        console.error('[importTrendingMovies]', error.message);
        return res.status(500).json({ success: false, message: 'Unable to import movies.' });
    }
};

export const getShows = async (req, res) => {
    try {
        const result = await rememberJson(
            redisKeys.bookableNowShowing(TMDB_REGION, SCHEDULE_DAYS),
            redisTtl.movies,
            () => getBookableNowShowingMovies({
                region: TMDB_REGION,
                days: SCHEDULE_DAYS,
                limit: 20,
            }),
        );

        setCacheHeader(res, result.cache).json({ success: true, shows: result.value });
    } catch (error) {
        console.error('[getShows]', error.message);
        return res.status(500).json({ success: false, message: 'Unable to load shows.' });
    }
};

export const getCinemas = async (req, res) => {
    try {
        const result = await rememberJson(redisKeys.cinemas(), redisTtl.cinemas, async () => {
            const halls = await Show.distinct('hall', {
                showDateTime: { $gte: new Date() },
                hall: { $ne: 'Virtual Hall' }
            });
            return [...new Set(halls.map((hall) => hall || 'Standard Hall'))].sort();
        });
        setCacheHeader(res, result.cache).json({ success: true, cinemas: result.value });
    } catch (error) {
        console.error('[getCinemas]', error.message);
        return res.status(500).json({ success: false, message: 'Unable to load cinemas.' });
    }
};

// Today may legitimately hold fewer shows once some have started, so a schedule
// is full when enough whole days are covered, not when every day is.
const isFullSchedule = (dateTime = {}) => Object.values(dateTime)
    .filter((shows) => Array.isArray(shows) && shows.length >= SHOWS_PER_DAY)
    .length >= SCHEDULE_DAYS;

const readOpenShows = (movieId) => Show.find({
    movie: movieId,
    showDateTime: { $gte: new Date() },
    hall: { $ne: 'Virtual Hall' },
    // Superseded generated shows are closed, not deleted.
    bookingOpen: { $ne: false },
}).sort({ showDateTime: 1 }).lean();

// Whether this movie's schedule should be kept topped up: it is on the Hero or
// in Now Showing. `null` means the answer could not be worked out this time.
const resolveScheduleManaged = async (movieId) => {
    try {
        return await isScheduledMovie(movieId);
    } catch (error) {
        console.error(JSON.stringify({
            event: 'schedule-membership-unavailable',
            movieId,
            errorCode: error?.code || error?.name || 'UNKNOWN',
        }));
        return null;
    }
};

export const getShow = async (req, res) => {
    try {
        const movieId = String(req.params.movieId || '');
        if (!movieId || movieId === 'undefined') {
            return res.status(400).json({ success: false, message: 'Invalid movie ID.' });
        }

        const loadShowtimes = async () => {
            const [initialShows, cachedMovie] = await Promise.all([
                readOpenShows(movieId),
                getJson(redisKeys.movie(movieId)),
            ]);
            let shows = initialShows;
            // An admin's own shows are the schedule; mock shows are never mixed in.
            const hasManualShows = shows.some((show) => !isGeneratedScheduleKey(show.scheduleKey));
            let scheduleManaged = false;
            if (isShowtimeGenerationEnabled() && !hasManualShows) {
                if (isFullSchedule(groupPersistedShowtimes(shows))) {
                    scheduleManaged = true;
                } else {
                    scheduleManaged = await resolveScheduleManaged(movieId);
                    if (scheduleManaged) {
                        try {
                            await ensureScheduledShowtimes({ movieId });
                        } catch (error) {
                            // A concurrent request holding the lock is already doing
                            // this. Anything else is reported, and whatever is
                            // persisted is still served.
                            if (!(error instanceof LockBusyError)) {
                                console.error(JSON.stringify({
                                    event: 'scheduled-showtimes-failed',
                                    movieId,
                                    errorCode: error?.code || error?.name || 'UNKNOWN',
                                }));
                            }
                        }
                        shows = await readOpenShows(movieId);
                    }
                }
            }
            const databaseMovie = cachedMovie ? null : await Movie.findById(movieId).lean();
            const movie = cachedMovie || databaseMovie || await fetchMovieFromTmdb(movieId);
            await setJson(redisKeys.movie(movieId), movie, redisTtl.movie);
            return {
                movie,
                dateTime: groupPersistedShowtimes(shows),
                simulated: shows.some((show) => isGeneratedScheduleKey(show.scheduleKey)),
                scheduleManaged,
            };
        };

        let result = await rememberJson(redisKeys.showtimes(movieId), redisTtl.showtimes, loadShowtimes);
        // A cached copy of a Hero or Now Showing movie that is not full yet (or
        // was cached before this field existed) is rebuilt rather than served, so
        // a movie joining the Hero is bookable at once instead of after the TTL.
        const staleSchedule = result.cache === 'hit'
            && isShowtimeGenerationEnabled()
            && result.value?.scheduleManaged !== false
            && !isFullSchedule(result.value?.dateTime);
        if (staleSchedule) {
            await deleteKeys(redisKeys.showtimes(movieId));
            result = await rememberJson(redisKeys.showtimes(movieId), redisTtl.showtimes, loadShowtimes);
        }

        const { scheduleManaged, ...payload } = result.value || {};
        setCacheHeader(res, result.cache).json({ success: true, ...payload });
    } catch (error) {
        console.error('[getShow]', error.message);
        return res.status(500).json({ success: false, message: 'Unable to load showtimes.' });
    }
};

export default {
    getNowPlayingMovies,
    addShow,
    importTrendingMovies,
    getShows,
    getCinemas,
    getShow,
    getTmdbSimilar,
    getHomeHero
};
