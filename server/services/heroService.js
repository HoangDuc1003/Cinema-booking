import { createHash } from 'node:crypto';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import SiteConfig from '../models/SiteConfig.js';
import { deleteByPattern, deleteKeys } from './cacheService.js';
import { attachHeroVideos } from './heroVideoService.js';
import { redisKeys } from './redisKeys.js';
import { hashSeed } from './seededRandom.js';
import { TMDB_MOVIE_GENRES } from './tmdbConfig.js';

const HERO_CONFIG_KEY = 'homeHero';
export const HERO_LIMIT = 5;
// The line-up turns over at 00:00 and 12:00 Vietnam time.
export const HERO_ROTATION_HOURS = 12;
const HERO_ROTATION_MS = HERO_ROTATION_HOURS * 60 * 60 * 1000;
// Upper bound on the rotation pool, far above the catalog's size, so a runaway
// collection cannot turn every Hero request into a full scan.
const HERO_ROTATION_POOL_LIMIT = 2000;
const HERO_RANDOM_HISTORY_MS = 2 * 24 * 60 * 60 * 1000;
const HERO_TIME_ZONE = 'Asia/Ho_Chi_Minh';
// Vietnam has no daylight saving time, so its offset is fixed.
const HERO_TIME_ZONE_OFFSET_MS = 7 * 60 * 60 * 1000;
const HERO_POOL_LIMIT = 150;
const MOVIE_SELECT = '_id title overview poster_path backdrop_path release_date vote_average vote_count popularity runtime genres updatedAt';

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

// Number of the 12-hour Vietnam slot the instant falls in. Even slots start at
// local midnight, odd ones at local noon.
const getHeroSlotOrdinal = (date = new Date()) => (
    Math.floor((date.getTime() + HERO_TIME_ZONE_OFFSET_MS) / HERO_ROTATION_MS)
);

// The UTC instant a slot starts at.
const heroSlotStart = (slotOrdinal) => new Date((slotOrdinal * HERO_ROTATION_MS) - HERO_TIME_ZONE_OFFSET_MS);

/** The slot's Vietnam start, e.g. `2026-03-10T12:00`. One line-up per key. */
export const getHeroRotationKey = (date = new Date()) => {
    const slot = getHeroSlotOrdinal(date);
    const hour = String((slot % 2) * HERO_ROTATION_HOURS).padStart(2, '0');
    return `${getHeroPosterDateKey(heroSlotStart(slot))}T${hour}:00`;
};

const normalizeGenres = (genres, genreIds) => {
    const source = Array.isArray(genres) && genres.length
        ? genres
        // Now-showing entries come from a TMDB list, which carries IDs only.
        : (Array.isArray(genreIds) ? genreIds : []).map((id) => ({ id, name: TMDB_MOVIE_GENRES[id] }));
    return source
        .slice(0, 3)
        .map((genre) => (typeof genre === 'string' ? { id: genre, name: genre } : genre))
        .filter((genre) => genre?.name);
};

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
        vote_count: Number.isFinite(Number(movie.vote_count)) ? Number(movie.vote_count) : 0,
        popularity: Number.isFinite(Number(movie.popularity)) ? Number(movie.popularity) : 0,
        runtime: Number(movie.runtime) > 0 ? Number(movie.runtime) : null,
        genres: normalizeGenres(movie.genres, movie.genre_ids),
        cta: { movieId: id },
    };
};

export const createHeroEtag = (payload) => {
    const identity = JSON.stringify({
        configuredMode: payload?.settings?.configuredMode || payload?.settings?.mode || 'auto',
        effectiveMode: payload?.settings?.effectiveMode || payload?.meta?.effectiveMode || 'auto',
        source: payload?.meta?.source || 'poster-rotation',
        version: payload?.version ?? 0,
        dateKey: payload?.dateKey || '',
        seed: payload?.meta?.seed || '',
        movies: (payload?.movies || []).map((movie) => movie.id || movie._id),
        // A newly configured trailer must not be answered with a 304.
        videos: (payload?.movies || []).map((movie) => movie.trailerVideo?.src || ''),
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

/** One line-up per 12-hour slot; `salt` lets an admin reshuffle early. */
export const getHeroSeed = ({ now = new Date(), salt = '' } = {}) => (
    `hero:${getHeroRotationKey(now)}:${salt || 'default'}`
);

const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

// "Hot" is popularity first, then rating, then how many people voted. The final
// ID tie-break keeps the order stable when a pool has no popularity data at all.
const compareHotness = (left, right) => (
    toNumber(right.popularity) - toNumber(left.popularity)
    || toNumber(right.vote_average) - toNumber(left.vote_average)
    || toNumber(right.vote_count) - toNumber(left.vote_count)
    || String(left.id).localeCompare(String(right.id))
);

/**
 * The whole pool in one fixed cycle and where the slot's window starts in it.
 * Each movie's place comes from a hash of its ID, so a catalog refresh adds and
 * drops movies without reshuffling the rest, and each slot moves HERO_LIMIT
 * places on.
 */
const rotationWindow = (pool, { now = new Date(), salt = '' } = {}) => {
    const key = `hero:cycle:${salt || 'default'}`;
    const cycle = [...pool].sort((left, right) => (
        hashSeed(`${key}:${left.id}`) - hashSeed(`${key}:${right.id}`)
        || String(left.id).localeCompare(String(right.id))
    ));
    const start = cycle.length ? (getHeroSlotOrdinal(now) * HERO_LIMIT) % cycle.length : 0;
    return { cycle, start };
};

/**
 * The slot's five movies: the next five places in a cycle over the whole
 * catalog. Every movie gets its turn before any poster comes back, and two
 * neighbouring slots never share a movie while the pool holds at least ten.
 */
export const selectHeroMovies = (pool = [], options = {}) => {
    if (pool.length <= HERO_LIMIT) return pool.slice(0, HERO_LIMIT);
    const { cycle, start } = rotationWindow(pool, options);
    return Array.from({ length: HERO_LIMIT }, (_, offset) => cycle[(start + offset) % cycle.length]);
};

/**
 * Every movie in the catalog with artwork, as IDs. The rotation only needs IDs,
 * so the five picked movies are loaded in full afterwards.
 */
export const loadHeroPool = async () => {
    const movies = await Movie.find({
        adult: { $ne: true },
        $or: [
            { backdrop_path: { $nin: [null, ''] } },
            { poster_path: { $nin: [null, ''] } },
        ],
    })
        .select('_id')
        .sort({ _id: 1 })
        .limit(HERO_ROTATION_POOL_LIMIT)
        .lean();
    return movies.map((movie) => ({ id: String(movie._id) }));
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
    const rotationKey = getHeroRotationKey(now);
    const seed = getHeroSeed({ now, salt: settings.seedSalt });
    const slot = getHeroSlotOrdinal(now);
    const startsAt = heroSlotStart(slot).toISOString();
    const nextRefreshAt = heroSlotStart(slot + 1).toISOString();
    const version = `${effectiveMode}:${rotationKey}:${settings.updatedAt?.getTime?.() || settings.updatedAt || 'initial'}`;
    const meta = {
        version,
        dateKey,
        rotationKey,
        rotationHours: HERO_ROTATION_HOURS,
        seed,
        timezone: HERO_TIME_ZONE,
        generatedAt: now.toISOString(),
        nextRefreshAt,
        source: effectiveMode === 'manual' ? 'manual-selection' : 'poster-rotation',
        configuredMode: settings.mode,
        effectiveMode,
    };
    return {
        version,
        batchId: `poster-${rotationKey}`,
        batchKey: rotationKey,
        generatedAt: meta.generatedAt,
        nextRefreshAt,
        timezone: HERO_TIME_ZONE,
        dateKey,
        rotationKey,
        settings: { ...settings, effectiveMode },
        movies,
        rotation: {
            type: 'poster-rotation',
            key: rotationKey,
            hours: HERO_ROTATION_HOURS,
            dateKey,
            seed,
            startsAt,
            endsAt: nextRefreshAt,
        },
        meta,
        cache: 'bypass',
    };
};

/**
 * The home Hero is the same for every visitor: five movies from the whole
 * catalog, turning over every 12 hours (00:00 and 12:00 Vietnam time), the most
 * popular of the five first. Manual mode overrides all five.
 */
export const getPublicHomeHero = async ({ now = new Date(), preloaded = null } = {}) => {
    const { settings, pool } = preloaded || {
        settings: await getHomeHeroConfig(),
        pool: null,
    };

    let movies = [];
    let effectiveMode = 'auto';
    if (settings.mode === 'manual' && settings.movieIds.length === HERO_LIMIT) {
        movies = await loadMoviesByIds(settings.movieIds);
        if (movies.length === HERO_LIMIT) effectiveMode = 'manual';
    }
    if (movies.length !== HERO_LIMIT) {
        const heroPool = pool || await loadHeroPool();
        const picks = selectHeroMovies(heroPool, { now, salt: settings.seedSalt });
        movies = (await loadMoviesByIds(picks.map((movie) => movie.id))).sort(compareHotness);
        effectiveMode = 'auto';
    }
    if (movies.length !== HERO_LIMIT) {
        throw createHttpError(503, 'Five poster-ready movies are required for the home hero.', 'HERO_POOL_TOO_SMALL');
    }

    return buildHeroPayload({ settings, movies: attachHeroVideos(movies), effectiveMode, now });
};

export const getAdminHomeHero = async ({ now = new Date() } = {}) => {
    // Loaded once and handed to getPublicHomeHero, so an admin request does not
    // repeat the pool query. The 150-movie list is for manual picks.
    const [settings, pool, availableMovies] = await Promise.all([
        getHomeHeroConfig(),
        loadHeroPool(),
        loadAvailablePosterMovies(),
    ]);
    const [liveHero, selectedMovies] = await Promise.all([
        getPublicHomeHero({ now, preloaded: { settings, pool } }),
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
 * for the next 12-hour turnover. Line-ups shown in the last two days are avoided
 * while the pool is large enough to allow it.
 */
export const randomizeHomeHero = async ({ now = new Date() } = {}) => {
    const pool = await loadHeroPool();
    if (pool.length < HERO_LIMIT) {
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
        selected = selectHeroMovies(pool, { now, salt: seedSalt });
        if (selected.every((movie) => !recentlyUsed.has(String(movie.id)))) break;
    }
    const movieIds = selected.map((movie) => String(movie.id));

    await SiteConfig.findOneAndUpdate(
        { key: HERO_CONFIG_KEY },
        {
            $setOnInsert: { key: HERO_CONFIG_KEY },
            $set: {
                // Stay in auto mode so the 12-hour rotation carries on from here.
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
