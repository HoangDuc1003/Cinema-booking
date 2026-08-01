import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import SiteConfig from '../models/SiteConfig.js';
import { HERO_DEFAULT_VOLUME } from '../configs/heroRotation.js';
import {
    bumpHeroCacheGeneration,
    getAdminHeroRotation,
    getPublicHeroRotation,
    invalidateHeroCaches,
    normalizeHeroMovie,
    rerandomizeActiveHero,
    updateHeroSoundSettings,
} from './heroRotationService.js';

const HERO_CONFIG_KEY = 'homeHero';
const HERO_LIMIT = 5;
const MOVIE_SELECT = '_id title overview poster_path backdrop_path release_date vote_average vote_count popularity adult runtime genres heroVideoId heroVideoMovieId heroVideoUrl heroVideoMimeType heroVideoPosterUrl heroVideoStatus heroVideoVersion heroVideoDuration heroVideoWidth heroVideoHeight heroVideoBytes heroVideoCodec heroVideoVerifiedAt heroVideoSource heroVideoAttribution updatedAt';

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
    return {
        mode: config?.homeHero?.mode === 'manual' ? 'manual' : 'auto',
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
export const getPublicHomeHero = async (options = {}) => getPublicHeroRotation({
    now: options.now ? new Date(options.now) : new Date(),
});

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
    const [rotation, settings, availableMovies] = await Promise.all([
        getAdminHeroRotation(),
        getHomeHeroConfig(),
        getLegacyAvailableMovies(),
    ]);
    const selectedMovies = rotation.activeMovies?.length
        ? rotation.activeMovies
        : await loadMoviesByIds(settings.movieIds).then((movies) => (
            movies.map((movie) => normalizeHeroMovie(movie, { posterOnly: true }))
        ));
    return {
        settings,
        selectedMovies,
        availableMovies,
        rotation,
    };
};

/**
 * Retained for backward compatibility with the existing Admin screen. Manual
 * IDs only affect the poster-only emergency fallback; an active rotation batch
 * remains authoritative for public playback.
 */
export const updateHomeHero = async ({
    mode,
    movieIds,
    heroSoundDefaultEnabled,
    heroDefaultVolume,
}) => {
    const nextMode = mode === 'manual' ? 'manual' : 'auto';
    const ids = sanitizeMovieIds(movieIds);
    if (nextMode === 'manual') {
        if (ids.length !== HERO_LIMIT) {
            throw createHttpError(400, 'Manual poster fallback requires exactly five unique movies.');
        }
        const count = await Movie.countDocuments({ _id: { $in: ids } });
        if (count !== ids.length) throw createHttpError(400, 'One or more selected movies no longer exist.');
    }
    const update = {
        'homeHero.mode': nextMode,
        'homeHero.movieIds': ids,
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
    } else {
        await bumpHeroCacheGeneration();
        await invalidateHeroCaches();
    }
    return {
        mode: config.homeHero.mode,
        movieIds: sanitizeMovieIds(config.homeHero.movieIds),
        ...soundSettings,
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
