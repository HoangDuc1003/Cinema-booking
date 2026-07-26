import axios from 'axios';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import { importTrendingMoviesLogic } from '../services/movieService.js';
import { getJson, rememberJson, setJson } from '../services/cacheService.js';
import { invalidateMovieCatalog } from '../services/cacheInvalidationService.js';
import { redisKeys, redisTtl } from '../services/redisKeys.js';
import { getPublicHomeHero } from '../services/heroService.js';
import { getPublicHomeNowShowing } from '../services/homeNowShowingService.js';
import { fetchTmdbImage } from '../services/tmdbImageService.js';
import { calculateCurrentSlot, getPublicHomePayload } from '../services/catalogRefreshService.js';
import { groupPersistedShowtimes, parseCinemaShowDateTime } from '../services/showtimeService.js';

const tmdbHeaders = () => ({ Authorization: `Bearer ${process.env.TMDB_API_KEY}` });
const setCacheHeader = (res, cache) => res.set('X-Cache', cache);

const fetchTmdbJson = async (path, params = {}) => {
    if (!process.env.TMDB_API_KEY) throw new Error('TMDB_API_KEY is not configured');
    const { data } = await axios.get(`https://api.themoviedb.org/3${path}`, {
        headers: tmdbHeaders(),
        params,
        timeout: Number(process.env.TMDB_TIMEOUT_MS) || 3000,
    });
    return data;
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

export const getHomeHero = async (req, res) => {
    try {
        const heroOffset = req.query.heroOffset !== undefined && !Number.isNaN(parseInt(req.query.heroOffset, 10))
            ? parseInt(req.query.heroOffset, 10)
            : undefined;
        const payload = await getPublicHomeHero({ heroOffset });
        return setCacheHeader(res, payload.cache).json({
            success: true,
            settings: payload.settings,
            movies: payload.movies,
        });
    } catch (error) {
        console.error('[getHomeHero]', error.message);
        return res.status(500).json({ success: false, message: 'Unable to load home hero.' });
    }
};

export const getTmdbHomeNowShowing = async (req, res) => {
    try {
        const result = await getPublicHomeNowShowing({
            limit: req.query.limit,
            region: req.query.region,
        });
        return setCacheHeader(res, result.cache).json({ success: true, data: result.value });
    } catch (error) {
        console.error('[getTmdbHomeNowShowing]', error.message);
        return res.status(502).json({ success: false, message: 'Unable to load home now-showing movies.' });
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
                () => fetchTmdbJson('/movie/now_playing', { language: 'en-US', page }),
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
        axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, { headers: tmdbHeaders() }),
        axios.get(`https://api.themoviedb.org/3/movie/${movieId}/credits`, { headers: tmdbHeaders() }),
    ]);

    return {
        _id: String(movieId),
        title: details.data.title,
        overview: details.data.overview,
        poster_path: details.data.poster_path,
        backdrop_path: details.data.backdrop_path,
        genres: details.data.genres,
        casts: credits.data.cast,
        release_date: details.data.release_date,
        original_language: details.data.original_language,
        tagline: details.data.tagline || '',
        vote_average: details.data.vote_average,
        runtime: details.data.runtime,
    };
};

export const getNowPlayingMovies = async (req, res) => {
    try {
        const result = await rememberJson(redisKeys.nowPlayingMovies(), redisTtl.movies, async () => {
            const { data } = await axios.get('https://api.themoviedb.org/3/movie/now_playing', {
                headers: tmdbHeaders(),
            });
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
        if (showsToCreate.length) await Show.insertMany(showsToCreate, { ordered: false });
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
        return res.json({ success: true, message: `Successfully imported ${result.count} movies with auto-generated shows!` });
    } catch (error) {
        console.error('[importTrendingMovies]', error.message);
        return res.status(500).json({ success: false, message: 'Unable to import movies.' });
    }
};

export const getShows = async (req, res) => {
    try {
        const result = await rememberJson(redisKeys.movies(), redisTtl.movies, async () => {
            const shows = await Show.find({
                showDateTime: { $gte: new Date() },
                hall: { $ne: 'Virtual Hall' },
            })
                .populate('movie')
                .sort({ showDateTime: 1 })
                .lean();
            const uniqueMovies = [];
            const seenIds = new Set();

            for (const show of shows) {
                const movieId = show.movie?._id && String(show.movie._id);
                if (movieId && !seenIds.has(movieId)) {
                    uniqueMovies.push(show.movie);
                    seenIds.add(movieId);
                }
            }
            return uniqueMovies;
        });

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

export const getShow = async (req, res) => {
    try {
        const movieId = String(req.params.movieId || '');
        if (!movieId || movieId === 'undefined') {
            return res.status(400).json({ success: false, message: 'Invalid movie ID.' });
        }

        const result = await rememberJson(redisKeys.showtimes(movieId), redisTtl.showtimes, async () => {
            const [shows, cachedMovie] = await Promise.all([
                Show.find({
                    movie: movieId,
                    showDateTime: { $gte: new Date() },
                    hall: { $ne: 'Virtual Hall' },
                }).sort({ showDateTime: 1 }).lean(),
                getJson(redisKeys.movie(movieId)),
            ]);
            const databaseMovie = cachedMovie ? null : await Movie.findById(movieId).lean();
            const movie = cachedMovie || databaseMovie || await fetchMovieFromTmdb(movieId);
            await setJson(redisKeys.movie(movieId), movie, redisTtl.movie);
            return { movie, dateTime: groupPersistedShowtimes(shows) };
        });

        setCacheHeader(res, result.cache).json({ success: true, ...result.value });
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
