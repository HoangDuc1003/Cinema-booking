import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import SiteConfig from '../models/SiteConfig.js';
import { deleteByPattern, deleteKeys, getJson } from './cacheService.js';
import { redisKeys } from './redisKeys.js';
import { getPublicHomePayload } from './catalogRefreshService.js';

const HERO_CONFIG_KEY = 'homeHero';
const HERO_LIMIT = 5;
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

const normalizeGenres = (genres) => (Array.isArray(genres) ? genres : [])
    .slice(0, 3)
    .map((genre) => (typeof genre === 'string' ? { id: genre, name: genre } : genre))
    .filter((genre) => genre?.name);

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

const loadMoviesByIds = async (movieIds) => {
    const ids = sanitizeMovieIds(movieIds);
    if (!ids.length) return [];
    const movies = await Movie.find({ _id: { $in: ids } }).select(MOVIE_SELECT).lean();
    const byId = new Map(movies.map((movie) => [String(movie._id), movie]));
    return ids.map((id) => normalizeHeroMovie(byId.get(id))).filter(Boolean);
};

const loadStoredHeroMovies = async () => {
    const [nativeMovies, activeShows, recentMovies] = await Promise.all([
        Movie.find({ heroVideoStatus: 'ready' }).select(MOVIE_SELECT).sort({ heroVideoVersion: -1 }).limit(20).lean(),
        Show.find({ showDateTime: { $gte: new Date() } })
            .populate({ path: 'movie', select: MOVIE_SELECT })
            .sort({ showDateTime: 1 })
            .limit(20)
            .lean(),
        Movie.find({}).select(MOVIE_SELECT).sort({ updatedAt: -1 }).limit(20).lean(),
    ]);
    const movies = new Map();
    const add = (movie) => {
        const normalized = normalizeHeroMovie(movie);
        if (normalized && !movies.has(normalized.id)) movies.set(normalized.id, normalized);
    };
    nativeMovies.forEach(add);
    activeShows.forEach((show) => add(show.movie));
    recentMovies.forEach(add);
    return [...movies.values()].slice(0, HERO_LIMIT);
};

const forcePosterOnly = (movies) => movies.map((movie) => ({
    ...movie,
    heroVideoUrl: '',
    heroVideoMimeType: '',
    heroVideoStatus: 'refreshing',
}));

export const getPublicHomeHero = async () => {
    const [config, refreshState] = await Promise.all([
        getHomeHeroConfig(),
        getJson(redisKeys.catalogRefreshState()),
    ]);
    let movies = [];
    let effectiveMode = 'auto';
    let meta = null;

    if (config.mode === 'manual' && config.movieIds.length) {
        movies = await loadMoviesByIds(config.movieIds);
        if (movies.length) effectiveMode = 'manual';
    }
    if (!movies.length) {
        try {
            const payload = await getPublicHomePayload(5, 'US', new Date());
            movies = payload.hero || [];
            meta = payload.meta || null;
        } catch {
            movies = [];
        }
    }
    if (!movies.length) movies = await loadStoredHeroMovies();
    if (refreshState?.active) movies = forcePosterOnly(movies);

    return {
        settings: {
            mode: config.mode,
            effectiveMode,
            movieIds: config.movieIds,
            updatedAt: config.updatedAt,
            catalog: meta,
        },
        movies,
        cache: meta ? 'catalog' : 'bypass',
    };
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
    const add = (movie) => {
        const normalized = normalizeHeroMovie(movie);
        if (normalized && !available.has(normalized.id)) available.set(normalized.id, normalized);
    };
    manualMovies.forEach(add);
    activeShows.forEach((show) => add(show.movie));
    recentMovies.forEach(add);
    return { settings: config, selectedMovies: manualMovies, availableMovies: [...available.values()] };
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
    await deleteByPattern(redisKeys.homeHeroPattern());
    return {
        mode: config?.homeHero?.mode || nextMode,
        movieIds: sanitizeMovieIds(config?.homeHero?.movieIds),
        updatedAt: config?.updatedAt,
    };
};
