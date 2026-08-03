import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import SiteConfig from '../models/SiteConfig.js';
import { HERO_DEFAULT_VOLUME } from '../configs/heroRotation.js';
import {
    bumpHeroCacheGeneration,
    getAdminHeroRotation,
    getPublicHeroRotation,
    invalidateHeroCaches,
    loadManualPayload,
    normalizeHeroMovie,
    rerandomizeActiveHero,
    updateHeroSoundSettings,
    validateNativeHeroMovie,
} from './heroRotationService.js';

const HERO_CONFIG_KEY = 'homeHero';
const HERO_LIMIT = 5;
const MOVIE_SELECT = '_id title overview poster_path backdrop_path release_date vote_average vote_count popularity adult runtime genres heroVideoId heroVideoMovieId heroVideoUrl heroVideoMimeType heroVideoPosterUrl heroVideoStatus heroVideoVersion heroVideoDuration heroVideoWidth heroVideoHeight heroVideoBytes heroVideoCodec heroVideoVerifiedAt heroVideoSource heroVideoAttribution updatedAt';

export const getSafeBackendIdentity = () => ({
    buildSha: String(process.env.BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'dev-local'),
    deploymentId: String(process.env.VERCEL_DEPLOYMENT_ID || 'local-dev'),
    environment: process.env.NODE_ENV || 'development',
});

const createHttpError = (status, message) => {
    const error = new Error(message);
    error.status = status;
    error.statusCode = status;
    return error;
};

const sanitizeMovieIds = (movieIds = []) => {
    const seen = new Set();
    return (Array.isArray(movieIds) ? movieIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
        .filter((id) => {
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        })
        .slice(0, HERO_LIMIT);
};

const loadMoviesByIds = async (movieIds) => {
    const ids = sanitizeMovieIds(movieIds);
    if (!ids.length) return [];
    const movies = await Movie.find({ _id: { $in: ids } }).select(MOVIE_SELECT).lean();
    const byId = new Map(movies.map((movie) => [String(movie._id), movie]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
};

export { normalizeHeroMovie };

export const getHomeHeroConfig = async () => {
    const defaultVolume = HERO_DEFAULT_VOLUME;
    const config = await SiteConfig.findOneAndUpdate(
        { key: HERO_CONFIG_KEY },
        {
            $setOnInsert: {
                key: HERO_CONFIG_KEY,
                'homeHero.mode': 'auto',
                'homeHero.movieIds': [],
                'homeHero.heroSoundDefaultEnabled': false,
                'homeHero.heroDefaultVolume': defaultVolume,
            },
        },
        { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
    ).lean();
    const volume = Number(config?.homeHero?.heroDefaultVolume);
    const mode = config?.homeHero?.mode === 'manual' ? 'manual' : 'auto';
    return {
        mode,
        configuredMode: mode,
        effectiveMode: mode,
        movieIds: sanitizeMovieIds(config?.homeHero?.movieIds),
        heroSoundDefaultEnabled: Boolean(config?.homeHero?.heroSoundDefaultEnabled),
        heroDefaultVolume: Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 1) : defaultVolume,
        updatedAt: config?.updatedAt || null,
    };
};

/**
 * Public Hero selection is always server-authoritative. `heroOffset` is ignored
 * deliberately so a client cannot reshuffle the active five-movie batch.
 */
export const getPublicHomeHero = async (options = {}) => {
    const settings = await getHomeHeroConfig();
    const now = options.now ? new Date(options.now) : new Date();
    if (settings.configuredMode === 'manual') {
        return loadManualPayload(settings, now);
    }
    return getPublicHeroRotation({ now });
};

const getLegacyAvailableMovies = async () => {
    const [activeShows, recentMovies] = await Promise.all([
        Show.find({ showDateTime: { $gte: new Date() } })
            .populate({ path: 'movie', select: MOVIE_SELECT })
            .sort({ showDateTime: 1 })
            .limit(80)
            .lean(),
        Movie.find({})
            .select(MOVIE_SELECT)
            .sort({ updatedAt: -1 })
            .limit(120)
            .lean(),
    ]);
    const available = new Map();
    const add = (movie) => {
        const normalized = normalizeHeroMovie(movie, { posterOnly: true });
        if (normalized && !available.has(normalized.id)) available.set(normalized.id, normalized);
    };
    activeShows.forEach((show) => add(show.movie));
    recentMovies.forEach(add);
    return [...available.values()];
};

export const getAdminHomeHero = async () => {
    const [rotation, settings, availableMovies, publicPayload] = await Promise.all([
        getAdminHeroRotation(),
        getHomeHeroConfig(),
        getLegacyAvailableMovies(),
        getPublicHomeHero(),
    ]);
    const rawManualMovies = await loadMoviesByIds(settings.movieIds);
    const manualMoviesNormalized = rawManualMovies.map((movie) => normalizeHeroMovie(movie));
    const liveMovies = publicPayload?.movies || [];
    const manualSelection = {
        movieIds: settings.movieIds,
        movies: manualMoviesNormalized,
    };
    const safeMeta = {
        configuredMode: settings.configuredMode,
        effectiveMode: publicPayload?.settings?.effectiveMode || settings.effectiveMode,
        source: settings.configuredMode === 'manual' ? 'manual-selection' : 'auto-rotation',
        version: publicPayload?.version || 1,
        cacheGeneration: publicPayload?.meta?.cacheGeneration || 0,
        ...getSafeBackendIdentity(),
    };
    return {
        settings,
        liveMovies,
        manualSelection,
        selectedMovies: manualMoviesNormalized,
        availableMovies,
        rotation,
        meta: safeMeta,
    };
};

/**
 * Updates Admin Hero settings (manual mode selection and sound configuration).
 */
export const updateHomeHero = async ({
    mode,
    movieIds,
    heroSoundDefaultEnabled,
    heroDefaultVolume,
}) => {
    const nextMode = mode === 'manual' ? 'manual' : 'auto';
    const rawIds = (Array.isArray(movieIds) ? movieIds : []).map((id) => String(id || '').trim()).filter(Boolean);
    const uniqueIds = new Set(rawIds);
    const ids = Array.from(uniqueIds);

    if (nextMode === 'manual') {
        const invalidMovies = [];
        if (rawIds.length !== HERO_LIMIT || uniqueIds.size !== HERO_LIMIT) {
            if (rawIds.length !== HERO_LIMIT) {
                invalidMovies.push({
                    movieId: 'selection',
                    title: 'Selection Count',
                    reasons: [`expected-${HERO_LIMIT}-movies-received-${rawIds.length}`],
                });
            } else {
                const seen = new Set();
                rawIds.forEach((id) => {
                    if (seen.has(id)) {
                        invalidMovies.push({
                            movieId: id,
                            title: 'Duplicate Selection',
                            reasons: ['duplicate-movie-id'],
                        });
                    } else {
                        seen.add(id);
                    }
                });
            }
        }

        const loadedMovies = await Movie.find({ _id: { $in: ids } }).select(MOVIE_SELECT).lean();
        const byId = new Map(loadedMovies.map((movie) => [String(movie._id), movie]));

        ids.forEach((id) => {
            const movie = byId.get(id);
            if (!movie) {
                invalidMovies.push({
                    movieId: id,
                    title: 'Unknown',
                    reasons: ['movie-not-found'],
                });
            } else {
                const validation = validateNativeHeroMovie(movie);
                if (!validation.valid) {
                    invalidMovies.push({
                        movieId: id,
                        title: movie.title || 'Untitled',
                        reasons: validation.reasons,
                    });
                }
            }
        });

        const urls = ids.map((id) => String(byId.get(id)?.heroVideoUrl || '')).filter(Boolean);
        const urlCounts = new Map();
        urls.forEach((url) => {
            urlCounts.set(url, (urlCounts.get(url) || 0) + 1);
        });
        ids.forEach((id) => {
            const movie = byId.get(id);
            if (movie && movie.heroVideoUrl && urlCounts.get(movie.heroVideoUrl) > 1) {
                const existing = invalidMovies.find((item) => item.movieId === id);
                if (existing) {
                    if (!existing.reasons.includes('duplicate-video-url')) {
                        existing.reasons.push('duplicate-video-url');
                    }
                } else {
                    invalidMovies.push({
                        movieId: id,
                        title: movie.title || 'Untitled',
                        reasons: ['duplicate-video-url'],
                    });
                }
            }
        });

        if (invalidMovies.length > 0) {
            const error = new Error('All five Manual Hero movies require verified native trailers.');
            error.status = 422;
            error.statusCode = 422;
            error.code = 'MANUAL_HERO_INVALID';
            error.invalidMovies = invalidMovies;
            throw error;
        }
    }

    const update = {
        'homeHero.mode': nextMode,
        'homeHero.movieIds': ids.slice(0, HERO_LIMIT),
    };
    if (typeof heroSoundDefaultEnabled === 'boolean') {
        update['homeHero.heroSoundDefaultEnabled'] = heroSoundDefaultEnabled;
    }
    if (heroDefaultVolume !== undefined) {
        const volume = Number(heroDefaultVolume);
        if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
            throw createHttpError(400, 'heroDefaultVolume must be between 0 and 1.');
        }
        update['homeHero.heroDefaultVolume'] = volume;
    }
    const config = await SiteConfig.findOneAndUpdate(
        { key: HERO_CONFIG_KEY },
        { $setOnInsert: { key: HERO_CONFIG_KEY }, $set: update },
        { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
    ).lean();
    const soundUpdateRequested = typeof heroSoundDefaultEnabled === 'boolean'
        || heroDefaultVolume !== undefined;
    const persistedVolume = Number(config.homeHero.heroDefaultVolume);
    let soundSettings = {
        heroSoundDefaultEnabled: Boolean(config.homeHero.heroSoundDefaultEnabled),
        heroDefaultVolume: Number.isFinite(persistedVolume) ? persistedVolume : HERO_DEFAULT_VOLUME,
        updatedAt: config.updatedAt,
    };
    if (soundUpdateRequested) {
        soundSettings = await updateHeroSoundSettings(soundSettings);
    }
    await bumpHeroCacheGeneration();
    await invalidateHeroCaches();
    const livePayload = await getPublicHomeHero();
    const safeMeta = livePayload.meta || {
        configuredMode: config.homeHero.mode,
        effectiveMode: livePayload?.settings?.effectiveMode || config.homeHero.mode,
        source: config.homeHero.mode === 'manual' ? 'manual-selection' : 'auto-rotation',
        version: livePayload?.version || 1,
        cacheGeneration: livePayload?.meta?.cacheGeneration || 0,
        ...getSafeBackendIdentity(),
    };
    return {
        settings: {
            mode: config.homeHero.mode,
            configuredMode: config.homeHero.mode,
            effectiveMode: livePayload?.settings?.effectiveMode || config.homeHero.mode,
            movieIds: sanitizeMovieIds(config.homeHero.movieIds),
            ...soundSettings,
        },
        liveHero: livePayload,
        meta: safeMeta,
        mode: config.homeHero.mode,
        movieIds: sanitizeMovieIds(config.homeHero.movieIds),
        ...soundSettings,
        ...livePayload,
    };
};

export const randomizeHomeHero = async ({ requestedBy, selectionSeed } = {}) => (
    rerandomizeActiveHero({ requestedBy, selectionSeed })
);

export { updateHeroSoundSettings };

export default {
    getPublicHomeHero,
    getAdminHomeHero,
    updateHomeHero,
    randomizeHomeHero,
    updateHeroSoundSettings,
};

