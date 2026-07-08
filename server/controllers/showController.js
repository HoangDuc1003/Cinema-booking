import axios from 'axios';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import { importTrendingMoviesLogic } from '../services/movieService.js';
import { getJson, rememberJson, setJson } from '../services/cacheService.js';
import { invalidateMovieCatalog } from '../services/cacheInvalidationService.js';
import { redisKeys, redisTtl } from '../services/redisKeys.js';
import { getPublicHomeHero } from '../services/heroService.js';

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
        const payload = await getPublicHomeHero();
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

export const getTmdbVideos = async (req, res) => {
    try {
        const movieId = String(req.params.movieId || '');
        if (!validMovieId(movieId)) return res.status(400).json({ success: false, message: 'Invalid movie ID.' });
        return await sendTmdbResponse(
            res,
            redisKeys.tmdbVideos(movieId),
            redisTtl.movie,
            () => withMovieFallback(
                'getTmdbVideos',
                () => fetchTmdbJson(`/movie/${movieId}/videos`, { language: 'en-US' }),
                async () => ({ id: movieId, results: [] }),
            ),
        );
    } catch (error) {
        console.error('[getTmdbVideos]', error.message);
        return res.status(502).json({ success: false, message: 'Unable to load movie videos.' });
    }
};

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
        const pages = Math.min(Math.max(Number.parseInt(req.query.pages, 10) || 4, 1), 5);
        return await sendTmdbResponse(
            res,
            redisKeys.tmdbTrailers(limit, pages),
            redisTtl.movies,
            async () => {
                try {
                    const trailers = [];
                    for (let page = 1; page <= pages && trailers.length < limit; page += 1) {
                        const nowPlaying = await fetchTmdbJson('/movie/now_playing', { language: 'en-US', page });
                        for (const movie of nowPlaying.results || []) {
                            const videos = await fetchTmdbJson(`/movie/${movie.id}/videos`, { language: 'en-US' });
                            const video = videos.results?.find(
                                (item) => item.site?.toLowerCase() === 'youtube' && item.type === 'Trailer',
                            );
                            if (!video) continue;
                            trailers.push({
                                id: movie.id,
                                title: movie.title,
                                overview: movie.overview,
                                release_date: movie.release_date,
                                vote_average: movie.vote_average,
                                backdrop_path: movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null,
                                videoUrl: `https://www.youtube.com/embed/${video.key}`,
                                thumbnail: `https://img.youtube.com/vi/${video.key}/hqdefault.jpg`,
                                videoName: video.name,
                                qualityLabel: '1080p',
                            });
                            if (trailers.length >= limit) break;
                        }
                    }
                    return trailers;
                } catch (error) {
                    console.warn('[getTmdbTrailers] TMDB unavailable:', error.message);
                    return [];
                }
            },
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
                    showDateTime: new Date(`${show.date}T${time}`),
                    showPrice: Number(showPrice),
                    hall: show.hall || '',
                    occupiedSeats: {},
                });
            }
        }

        if (showsToCreate.length) await Show.insertMany(showsToCreate, { ordered: false });
        await invalidateMovieCatalog(String(movieId));
        return res.json({ success: true, message: 'Show added successfully.' });
    } catch (error) {
        console.error('[addShow]', error.message);
        const status = error?.code === 11000 ? 409 : 500;
        return res.status(status).json({
            success: false,
            message: status === 409 ? 'One or more showtimes already exist.' : 'Unable to add shows.',
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
            const shows = await Show.find({ showDateTime: { $gte: new Date() } })
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

            if (uniqueMovies.length < 10) {
                try {
                    const data = await fetchTmdbJson('/movie/now_playing', { language: 'en-US', page: 1 });
                    for (const movie of data.results || []) {
                        const movieId = String(movie.id);
                        if (seenIds.has(movieId)) continue;
                        uniqueMovies.push({
                            _id: movieId,
                            title: movie.title,
                            poster_path: movie.poster_path,
                            backdrop_path: movie.backdrop_path,
                            vote_average: movie.vote_average,
                            release_date: movie.release_date,
                            isVirtual: true,
                        });
                        seenIds.add(movieId);
                    }
                } catch (error) {
                    console.warn('[getShows] TMDB unavailable, continuing with MongoDB:', error.message);
                }
            }

            if (uniqueMovies.length < 10) {
                const databaseMovies = await Movie.find({ _id: { $nin: [...seenIds] } })
                    .sort({ updatedAt: -1 })
                    .limit(20 - uniqueMovies.length)
                    .lean();
                for (const movie of databaseMovies) {
                    const movieId = String(movie._id);
                    if (seenIds.has(movieId)) continue;
                    uniqueMovies.push({ ...movie, isVirtual: true });
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
            const halls = await Show.distinct('hall', { showDateTime: { $gte: new Date() } });
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
                Show.find({ movie: movieId, showDateTime: { $gte: new Date() } }).lean(),
                getJson(redisKeys.movie(movieId)),
            ]);
            const databaseMovie = cachedMovie ? null : await Movie.findById(movieId).lean();
            const movie = cachedMovie || databaseMovie || await fetchMovieFromTmdb(movieId);
            await setJson(redisKeys.movie(movieId), movie, redisTtl.movie);

            const showsByTimestamp = new Map();
            for (const show of shows) {
                const timestamp = new Date(show.showDateTime).getTime();
                if (!showsByTimestamp.has(timestamp)) showsByTimestamp.set(timestamp, show);
            }

            const dateTime = {};
            const now = new Date();
            const standardTimes = ['10:00', '13:30', '17:00', '20:30'];
            for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
                const date = new Date(now);
                date.setDate(date.getDate() + dayOffset);
                const dateString = date.toISOString().split('T')[0];
                dateTime[dateString] = [];

                for (const time of standardTimes) {
                    const showDateTime = new Date(`${dateString}T${time}:00.000Z`);
                    if (showDateTime < now) continue;
                    const existing = showsByTimestamp.get(showDateTime.getTime());
                    dateTime[dateString].push(existing ? {
                        time: existing.showDateTime,
                        showId: existing._id,
                        price: existing.showPrice,
                        hall: existing.hall || 'Standard Hall',
                        isVirtual: false,
                    } : {
                        time: showDateTime,
                        showId: `virtual_${movieId}_${showDateTime.getTime()}`,
                        price: 50,
                        hall: 'Virtual Hall',
                        isVirtual: true,
                    });
                }
            }

            return { movie, dateTime };
        });

        setCacheHeader(res, result.cache).json({ success: true, ...result.value });
    } catch (error) {
        console.error('[getShow]', error.message);
        return res.status(500).json({ success: false, message: 'Unable to load showtimes.' });
    }
};

export default { getNowPlayingMovies, addShow, importTrendingMovies, getShows, getCinemas, getShow, getHomeHero };
