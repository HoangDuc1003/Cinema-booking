import axios from 'axios';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import { importTrendingMoviesLogic } from '../services/movieService.js';
import { getJson, rememberJson, setJson } from '../services/cacheService.js';
import { invalidateMovieCatalog } from '../services/cacheInvalidationService.js';
import { redisKeys, redisTtl } from '../services/redisKeys.js';

const tmdbHeaders = () => ({ Authorization: `Bearer ${process.env.TMDB_API_KEY}` });
const setCacheHeader = (res, cache) => res.set('X-Cache', cache);

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
                const { data } = await axios.get('https://api.themoviedb.org/3/movie/now_playing', {
                    headers: tmdbHeaders(),
                });
                for (const movie of data.results) {
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

export default { getNowPlayingMovies, addShow, importTrendingMovies, getShows, getCinemas, getShow };
