import { createHash } from 'node:crypto';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import SiteConfig from '../models/SiteConfig.js';
import { deleteByPattern, deleteKeys } from './cacheService.js';
import { getDeterministicPermutation } from './catalogRefreshService.js';
import { redisKeys } from './redisKeys.js';

const HERO_CONFIG_KEY = 'homeHero';
const HERO_LIMIT = 5;
const HERO_RANDOM_HISTORY_MS = 2 * 24 * 60 * 60 * 1000;
const HERO_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const HERO_POOL_LIMIT = 150;
const MOVIE_SELECT = '_id title overview poster_path backdrop_path release_date vote_average runtime genres updatedAt';

const createHttpError = (status, message, code) => {
    const error = new Error(message);
    error.status = status;
    error.statusCode = status;
    if (code) error.code = code;
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

const getVietnamDateParts = (date = new Date()) => (
    new Intl.DateTimeFormat('en-US', {
        timeZone: HERO_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date).reduce((parts, part) => ({ ...parts, [part.type]: part.value }), {})
);

export const getHeroPosterDateKey = (date = new Date()) => {
    const parts = getVietnamDateParts(date);
    return `${parts.year}-${parts.month}-${parts.day}`;
};

// Vietnam is UTC+7, so local midnight is 17:00 UTC on the previous calendar day.
const getNextVietnamMidnight = (date = new Date()) => (
    new Date(`${getHeroPosterDateKey(date)}T17:00:00.000Z`)
);

const normalizeGenres = (genres) => (Array.isArray(genres) ? genres : [])
    .slice(0, 3)
    .map((genre) => (typeof genre === 'string' ? { id: genre, name: genre } : genre))
    .filter((genre) => genre?.name);

/**
 * The public Hero shape. Poster-only by design: the Hero renders a still image,
 * so no video field is ever projected onto it.
 */
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
        cta: { movieId: id },
    };
};

export const createHeroEtag = (payload) => {
    const identity = JSON.stringify({
        configuredMode: payload?.settings?.configuredMode || payload?.settings?.mode || 'auto',
        effectiveMode: payload?.settings?.effectiveMode || payload?.meta?.effectiveMode || 'auto',
        source: payload?.meta?.source || 'daily-poster-rotation',
        version: payload?.version ?? 0,
        dateKey: payload?.dateKey || '',
        seed: payload?.meta?.seed || '',
        movies: (payload?.movies || []).map((movie) => movie.id || movie._id),
        settingsUpdatedAt: payload?.settings?.updatedAt || null,
        nextRefreshAt: payload?.nextRefreshAt || null,
    });
    const digest = createHash('sha256').update(identity).digest('hex').slice(0, 24);
    return `"hero-${digest}"`;
};

export const matchesHeroEtag = (ifNoneMatch, etag) => {
    const normalize = (value) => String(value || '')
        .trim()
        .replace(/^W\//, '')
        .replace(/^"|"$/g, '');
    const candidates = String(ifNoneMatch || '').split(',').map(normalize);
    return candidates.includes('*') || candidates.includes(normalize(etag));
};

const loadMoviesByIds = async (movieIds) => {
    const ids = sanitizeMovieIds(movieIds);
    if (!ids.length) return [];
    const movies = await Movie.find({ _id: { $in: ids } }).select(MOVIE_SELECT).lean();
    const byId = new Map(movies.map((movie) => [String(movie._id), movie]));
    // Preserve the saved admin order rather than the order MongoDB returned.
    return ids.map((id) => normalizeHeroMovie(byId.get(id))).filter(Boolean);
};

const addUniqueMovie = (movies, movie) => {
    const normalized = normalizeHeroMovie(movie);
    if (normalized && !movies.has(normalized.id)) movies.set(normalized.id, normalized);
};

const loadAvailablePosterMovies = async () => {
    const [activeShows, recentMovies] = await Promise.all([
        Show.find({ showDateTime: { $gte: new Date() } })
            .populate({ path: 'movie', select: MOVIE_SELECT })
            .sort({ showDateTime: 1 })
            .limit(HERO_POOL_LIMIT)
            .lean(),
        Movie.find({})
            .select(MOVIE_SELECT)
            .sort({ updatedAt: -1, _id: 1 })
            .limit(HERO_POOL_LIMIT)
            .lean(),
    ]);
    const movies = new Map();
    activeShows.forEach((show) => addUniqueMovie(movies, show.movie));
    recentMovies.forEach((movie) => addUniqueMovie(movies, movie));
    return [...movies.values()];
};

export const getHeroDailySeed = (date = new Date(), salt = '') => (
    `hero:${getHeroPosterDateKey(date)}:${salt || 'default'}`
);

/**
 * Picks five posters for the Vietnam calendar day. The seed changes once per day,
 * so the line-up is reshuffled daily but stays identical for every visitor and
 * every server instance on that day - there is no per-request randomness.
 *
 * Candidate IDs are sorted before shuffling so the same pool plus the same seed
 * always yields the same five movies, whatever order MongoDB returned them in.
 */
export const selectDailyPosterMovies = (movies, date = new Date(), salt = '') => {
    if (movies.length <= HERO_LIMIT) return movies.slice(0, HERO_LIMIT);
    const byId = new Map(movies.map((movie) => [String(movie.id), movie]));
    const sortedIds = [...byId.keys()].sort();
    const shuffledIds = getDeterministicPermutation(sortedIds, getHeroDailySeed(date, salt));
    return shuffledIds.slice(0, HERO_LIMIT).map((id) => byId.get(id));
};

const invalidateHeroCaches = async () => {
    await deleteKeys(redisKeys.homeHero());
    await deleteByPattern(redisKeys.homeHeroPattern());
};

const toSettings = (config) => {
    const mode = config?.homeHero?.mode === 'manual' ? 'manual' : 'auto';
    return {
        mode,
        configuredMode: mode,
        effectiveMode: mode,
        movieIds: sanitizeMovieIds(config?.homeHero?.movieIds),
        seedSalt: String(config?.homeHero?.seedSalt || ''),
        updatedAt: config?.updatedAt || null,
    };
};

/**
 * Reads the hero config without writing to it.
 *
 * This used to be a single upsert, but Mongoose bumps `updatedAt` on every
 * findOneAndUpdate even when nothing changes - and `updatedAt` feeds the payload
 * version and therefore the ETag. That made the ETag different on every request,
 * so `/api/show/hero` never returned 304 and no CDN could hold the response.
 * Reading first also keeps the public hero path free of database writes.
 */
export const getHomeHeroConfig = async () => {
    const existing = await SiteConfig.findOne({ key: HERO_CONFIG_KEY }).lean();
    if (existing) return toSettings(existing);

    const created = await SiteConfig.findOneAndUpdate(
        { key: HERO_CONFIG_KEY },
        { $setOnInsert: { key: HERO_CONFIG_KEY, homeHero: { mode: 'auto', movieIds: [] } } },
        { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
    ).lean();
    return toSettings(created);
};

const buildHeroPayload = ({ settings, movies, effectiveMode, now }) => {
    const dateKey = getHeroPosterDateKey(now);
    const seed = getHeroDailySeed(now, settings.seedSalt);
    const nextRefreshAt = getNextVietnamMidnight(now).toISOString();
    const version = `${effectiveMode}:${dateKey}:${settings.updatedAt?.getTime?.() || settings.updatedAt || 'initial'}`;
    const meta = {
        version,
        dateKey,
        seed,
        timezone: HERO_TIME_ZONE,
        generatedAt: now.toISOString(),
        nextRefreshAt,
        source: effectiveMode === 'manual' ? 'manual-selection' : 'daily-poster-rotation',
        configuredMode: settings.mode,
        effectiveMode,
    };
    return {
        version,
        batchId: `poster-${dateKey}`,
        batchKey: dateKey,
        generatedAt: meta.generatedAt,
        nextRefreshAt,
        timezone: HERO_TIME_ZONE,
        dateKey,
        settings: { ...settings, effectiveMode },
        movies,
        rotation: { type: 'daily-poster', dateKey, seed },
        meta,
        cache: 'bypass',
    };
};

/**
 * The home Hero is poster-only. Auto mode reshuffles five stored movies once per
 * Vietnam calendar day; every visitor receives that same server-decided order.
 */
export const getPublicHomeHero = async ({ now = new Date(), preloaded = null } = {}) => {
    const [settings, availableMovies] = preloaded || await Promise.all([
        getHomeHeroConfig(),
        loadAvailablePosterMovies(),
    ]);

    let movies = [];
    let effectiveMode = 'auto';
    if (settings.mode === 'manual' && settings.movieIds.length === HERO_LIMIT) {
        movies = await loadMoviesByIds(settings.movieIds);
        if (movies.length === HERO_LIMIT) effectiveMode = 'manual';
    }
    if (movies.length !== HERO_LIMIT) {
        movies = selectDailyPosterMovies(availableMovies, now, settings.seedSalt);
        effectiveMode = 'auto';
    }
    if (movies.length !== HERO_LIMIT) {
        throw createHttpError(503, 'Five poster-ready movies are required for the home hero.', 'HERO_POOL_TOO_SMALL');
    }

    return buildHeroPayload({ settings, movies, effectiveMode, now });
};

export const getAdminHomeHero = async ({ now = new Date() } = {}) => {
    // Loaded once and handed to getPublicHomeHero. Letting it reload would repeat
    // both the 150-document pool query and the config upsert on every admin request.
    const preloaded = await Promise.all([
        getHomeHeroConfig(),
        loadAvailablePosterMovies(),
    ]);
    const [settings, availableMovies] = preloaded;
    const [liveHero, selectedMovies] = await Promise.all([
        getPublicHomeHero({ now, preloaded }),
        loadMoviesByIds(settings.movieIds),
    ]);
    return {
        settings: liveHero.settings,
        liveMovies: liveHero.movies,
        selectedMovies,
        manualSelection: { movieIds: settings.movieIds, movies: selectedMovies },
        availableMovies,
        meta: liveHero.meta,
    };
};

export const updateHomeHero = async ({ mode, movieIds }) => {
    const nextMode = mode === 'manual' ? 'manual' : 'auto';
    const rawIds = (Array.isArray(movieIds) ? movieIds : []).map((id) => String(id || '').trim()).filter(Boolean);
    const ids = sanitizeMovieIds(rawIds);
    if (nextMode === 'manual') {
        if (rawIds.length !== HERO_LIMIT || ids.length !== HERO_LIMIT) {
            throw createHttpError(
                400,
                `Choose exactly ${HERO_LIMIT} different movies for manual poster mode.`,
                'MANUAL_HERO_INVALID',
            );
        }
        const found = await Movie.find({ _id: { $in: ids } }).select('_id').lean();
        const foundIds = new Set(found.map((movie) => String(movie._id)));
        const invalidMovies = ids.filter((id) => !foundIds.has(id));
        if (invalidMovies.length) {
            const error = createHttpError(400, 'One or more selected movies no longer exist.', 'MANUAL_HERO_INVALID');
            error.invalidMovies = invalidMovies;
            throw error;
        }
    }
    const config = await SiteConfig.findOneAndUpdate(
        { key: HERO_CONFIG_KEY },
        { $setOnInsert: { key: HERO_CONFIG_KEY }, $set: { 'homeHero.mode': nextMode, 'homeHero.movieIds': ids } },
        { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
    ).lean();
    await invalidateHeroCaches();
    const liveHero = await getPublicHomeHero();
    return { settings: liveHero.settings, liveHero, meta: liveHero.meta, savedMode: toSettings(config).mode };
};

/**
 * Rolls a fresh seed salt so auto mode reshuffles immediately instead of waiting
 * for the next Vietnam midnight. Line-ups shown in the last two days are avoided
 * while the pool is large enough to allow it.
 */
export const randomizeHomeHero = async ({ now = new Date() } = {}) => {
    const availableMovies = await loadAvailablePosterMovies();
    if (availableMovies.length < HERO_LIMIT) {
        throw createHttpError(400, `At least ${HERO_LIMIT} movies are required to randomize the Hero.`, 'HERO_POOL_TOO_SMALL');
    }
    const timestamp = now.getTime();
    const config = await SiteConfig.findOne({ key: HERO_CONFIG_KEY }).lean();
    const history = (config?.homeHero?.randomHistory || []).filter((entry) => {
        const entryTime = new Date(entry?.timestamp || 0).getTime();
        return Number.isFinite(entryTime) && timestamp - entryTime < HERO_RANDOM_HISTORY_MS;
    });
    const recentlyUsed = new Set(history.flatMap((entry) => entry.movieIds || []).map(String));

    // Try a bounded number of salts for a line-up that avoids the recent history.
    let seedSalt = String(timestamp);
    let selected = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
        seedSalt = `${timestamp}-${attempt}`;
        selected = selectDailyPosterMovies(availableMovies, now, seedSalt);
        if (selected.every((movie) => !recentlyUsed.has(String(movie.id)))) break;
    }
    const movieIds = selected.map((movie) => String(movie.id));

    await SiteConfig.findOneAndUpdate(
        { key: HERO_CONFIG_KEY },
        {
            $setOnInsert: { key: HERO_CONFIG_KEY },
            $set: {
                // Stay in auto mode so the daily seed keeps rotating from here.
                'homeHero.mode': 'auto',
                'homeHero.seedSalt': seedSalt,
                'homeHero.randomHistory': [...history, { movieIds, timestamp: new Date(timestamp) }].slice(-20),
            },
        },
        { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
    ).lean();
    await invalidateHeroCaches();
    return getAdminHomeHero({ now });
};

export default {
    getPublicHomeHero,
    getAdminHomeHero,
    updateHomeHero,
    randomizeHomeHero,
    createHeroEtag,
    matchesHeroEtag,
};
