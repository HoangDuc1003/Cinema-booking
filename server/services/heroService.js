import axios from 'axios';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import SiteConfig from '../models/SiteConfig.js';
import { deleteKeys, rememberJson } from './cacheService.js';
import { redisKeys, redisTtl } from './redisKeys.js';

const HERO_CONFIG_KEY = 'homeHero';
const HERO_LIMIT = 5;
const TMDB_DAILY_PAGE_WINDOW = 20;
const VIETNAM_TIME_OFFSET_MS = 7 * 60 * 60 * 1000;
const MOVIE_SELECT = '_id title overview poster_path backdrop_path release_date vote_average runtime genres heroVideoId heroVideoUrl heroVideoMimeType heroVideoPosterUrl heroVideoStatus heroVideoVersion updatedAt';

const createHttpError = (status, message) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const sanitizeMovieIds = (movieIds = []) => {
    const seen = new Set();
    return movieIds
        .map((id) => String(id || '').trim())
        .filter(Boolean)
        .filter((id) => {
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        })
        .slice(0, HERO_LIMIT);
};

const normalizeGenres = (genres) => {
    if (!Array.isArray(genres)) return [];
    return genres.slice(0, 3).map((genre) => (
        typeof genre === 'string' ? { id: genre, name: genre } : genre
    )).filter((genre) => genre?.name);
};

const getVietnamDayNumber = (date = new Date()) => (
    Math.floor((date.getTime() + VIETNAM_TIME_OFFSET_MS) / 86400000)
);

const getDailyTmdbPage = () => (getVietnamDayNumber() % TMDB_DAILY_PAGE_WINDOW) + 1;

const rotateByDailySeed = (items = []) => {
    if (!items.length) return items;
    const offset = getVietnamDayNumber() % items.length;
    return [...items.slice(offset), ...items.slice(0, offset)];
};

export const normalizeHeroMovie = (movie) => {
    if (!movie) return null;
    const id = String(movie._id || movie.id || '');
    if (!id) return null;

    return {
        _id: id,
        id,
        title: movie.title || movie.name || 'Untitled',
        overview: movie.overview || '',
        poster_path: movie.poster_path || null,
        backdrop_path: movie.backdrop_path || null,
        release_date: movie.release_date || '',
        vote_average: Number.isFinite(Number(movie.vote_average)) ? Number(movie.vote_average) : null,
        runtime: Number.isFinite(Number(movie.runtime)) ? Number(movie.runtime) : null,
        genres: normalizeGenres(movie.genres),
        heroVideoUrl: movie.heroVideoUrl || '',
        heroVideoMimeType: movie.heroVideoMimeType || '',
        heroVideoPosterUrl: movie.heroVideoPosterUrl || '',
        heroVideoStatus: movie.heroVideoStatus || '',
        heroVideoVersion: movie.heroVideoVersion || '',
    };
};

export const getHomeHeroConfig = async () => {
    const config = await SiteConfig.findOneAndUpdate(
        { key: HERO_CONFIG_KEY },
        { $setOnInsert: { key: HERO_CONFIG_KEY, homeHero: { mode: 'auto', movieIds: [] } } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return {
        mode: config?.homeHero?.mode === 'manual' ? 'manual' : 'auto',
        movieIds: sanitizeMovieIds(config?.homeHero?.movieIds),
        updatedAt: config?.updatedAt,
    };
};

const addUniqueMovie = (map, movie) => {
    const normalized = normalizeHeroMovie(movie);
    if (!normalized || map.has(normalized.id)) return;
    map.set(normalized.id, normalized);
};

const loadMoviesByIds = async (movieIds) => {
    const ids = sanitizeMovieIds(movieIds);
    if (!ids.length) return [];

    const movies = await Movie.find({ _id: { $in: ids } }).select(MOVIE_SELECT).lean();
    const byId = new Map(movies.map((movie) => [String(movie._id), movie]));
    return ids.map((id) => normalizeHeroMovie(byId.get(id))).filter(Boolean);
};

const fetchTmdbPopularMovies = async (page = getDailyTmdbPage()) => {
    if (!process.env.TMDB_API_KEY) return [];
    try {
        const { data } = await axios.get('https://api.themoviedb.org/3/movie/popular', {
            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
            params: { language: 'en-US', page },
            timeout: Number(process.env.TMDB_TIMEOUT_MS) || 3000,
        });
        return (data.results || []).map(normalizeHeroMovie).filter(Boolean);
    } catch (error) {
        console.warn('[homeHero] TMDB fallback skipped:', error.message);
        return [];
    }
};

const loadAutoHeroMovies = async () => {
    const movies = new Map();

    const [nativeMovies, tmdbMovies, activeShows, recentMovies] = await Promise.all([
        Movie.find({ heroVideoStatus: 'ready' })
            .select(MOVIE_SELECT)
            .sort({ heroVideoVersion: -1 })
            .limit(24)
            .lean(),
        fetchTmdbPopularMovies(),
        Show.find({ showDateTime: { $gte: new Date() } })
            .populate({ path: 'movie', select: MOVIE_SELECT })
            .sort({ showDateTime: 1 })
            .limit(24)
            .lean(),
        Movie.find({})
            .select(MOVIE_SELECT)
            .sort({ updatedAt: -1 })
            .limit(24)
            .lean(),
    ]);

    for (const movie of rotateByDailySeed(nativeMovies)) {
        addUniqueMovie(movies, movie);
        if (movies.size >= HERO_LIMIT) return [...movies.values()];
    }

    for (const movie of tmdbMovies) {
        addUniqueMovie(movies, movie);
        if (movies.size >= HERO_LIMIT) return [...movies.values()];
    }

    for (const show of rotateByDailySeed(activeShows)) {
        addUniqueMovie(movies, show.movie);
        if (movies.size >= HERO_LIMIT) return [...movies.values()];
    }

    for (const movie of rotateByDailySeed(recentMovies)) {
        addUniqueMovie(movies, movie);
        if (movies.size >= HERO_LIMIT) break;
    }

    return [...movies.values()].slice(0, HERO_LIMIT);
};

const buildHomeHeroPayload = async () => {
    const config = await getHomeHeroConfig();
    let movies = [];
    let effectiveMode = 'auto';

    if (config.mode === 'manual' && config.movieIds.length) {
        movies = await loadMoviesByIds(config.movieIds);
        if (movies.length) effectiveMode = 'manual';
    }

    if (!movies.length) movies = await loadAutoHeroMovies();

    return {
        settings: {
            mode: config.mode,
            effectiveMode,
            movieIds: config.movieIds,
            dailyPage: getDailyTmdbPage(),
            updatedAt: config.updatedAt,
        },
        movies,
    };
};

export const getPublicHomeHero = async () => {
    const result = await rememberJson(redisKeys.homeHero(), redisTtl.movies, buildHomeHeroPayload);
    return { ...result.value, cache: result.cache };
};

export const getAdminHomeHero = async () => {
    const config = await getHomeHeroConfig();

    const [manualMovies, activeShows, recentMovies] = await Promise.all([
        loadMoviesByIds(config.movieIds),
        Show.find({ showDateTime: { $gte: new Date() } })
            .populate({ path: 'movie', select: MOVIE_SELECT })
            .sort({ showDateTime: 1 })
            .limit(80)
            .lean(),
        Movie.find({}).select(MOVIE_SELECT).sort({ updatedAt: -1 }).limit(120).lean(),
    ]);

    const available = new Map();
    for (const movie of manualMovies) addUniqueMovie(available, movie);
    for (const show of activeShows) addUniqueMovie(available, show.movie);
    for (const movie of recentMovies) addUniqueMovie(available, movie);

    return {
        settings: config,
        selectedMovies: manualMovies,
        availableMovies: [...available.values()],
    };
};

export const updateHomeHero = async ({ mode, movieIds }) => {
    const nextMode = mode === 'manual' ? 'manual' : 'auto';
    const ids = sanitizeMovieIds(movieIds);

    if (nextMode === 'manual') {
        if (!ids.length) throw createHttpError(400, 'Choose at least one movie for manual hero mode.');
        const count = await Movie.countDocuments({ _id: { $in: ids } });
        if (count !== ids.length) throw createHttpError(400, 'One or more selected movies no longer exist.');
    }

    const config = await SiteConfig.findOneAndUpdate(
        { key: HERO_CONFIG_KEY },
        { $set: { homeHero: { mode: nextMode, movieIds: ids } } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    await deleteKeys(redisKeys.homeHero());
    return {
        mode: config?.homeHero?.mode || nextMode,
        movieIds: sanitizeMovieIds(config?.homeHero?.movieIds),
        updatedAt: config?.updatedAt,
    };
};
