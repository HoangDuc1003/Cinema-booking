import { createHash } from 'node:crypto';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import SiteConfig from '../models/SiteConfig.js';
import { deleteByPattern, deleteKeys } from './cacheService.js';
import { getDeterministicPermutation } from './catalogRefreshService.js';
import { redisKeys } from './redisKeys.js';

const HERO_CONFIG_KEY = 'homeHero';
const HERO_LIMIT = 5;
// Two slots always go to the hottest movies; the rest are seeded per viewer.
const HERO_HOT_COUNT = 2;
const HERO_SEED_WINDOW_DAYS = 3;
const HERO_RANDOM_HISTORY_MS = 2 * 24 * 60 * 60 * 1000;
const HERO_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const HERO_TIME_ZONE_OFFSET_MS = 7 * 60 * 60 * 1000;
const MS_PER_DAY = 86400000;
const HERO_POOL_LIMIT = 150;
const ANONYMOUS_VIEWER = 'anon';
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

// Day number since the epoch for the Vietnam calendar date, so windows can be
// counted in whole local days without any timezone drift.
const getVietnamDayOrdinal = (date = new Date()) => {
    const [year, month, day] = getHeroPosterDateKey(date).split('-').map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
};

// Vietnam midnight that starts the given local day, as a UTC instant.
const vietnamMidnightOf = (dayOrdinal) => new Date((dayOrdinal * MS_PER_DAY) - HERO_TIME_ZONE_OFFSET_MS);

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
        vote_count: Number.isFinite(Number(movie.vote_count)) ? Number(movie.vote_count) : 0,
        popularity: Number.isFinite(Number(movie.popularity)) ? Number(movie.popularity) : 0,
        runtime: Number.isFinite(Number(movie.runtime)) ? Number(movie.runtime) : null,
        genres: normalizeGenres(movie.genres),
        cta: { movieId: id },
    };
};

export const createHeroEtag = (payload) => {
    const identity = JSON.stringify({
        configuredMode: payload?.settings?.configuredMode || payload?.settings?.mode || 'auto',
        effectiveMode: payload?.settings?.effectiveMode || payload?.meta?.effectiveMode || 'auto',
        source: payload?.meta?.source || 'seeded-poster-rotation',
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

/**
 * Identifies the 3-day seed window containing `date`. Windows are counted in
 * whole Vietnam days, so one always turns over exactly at local midnight.
 */
export const getHeroSeedWindow = (date = new Date()) => {
    const dayOrdinal = getVietnamDayOrdinal(date);
    const index = Math.floor(dayOrdinal / HERO_SEED_WINDOW_DAYS);
    return {
        index,
        key: `w${index}`,
        startsAt: vietnamMidnightOf(index * HERO_SEED_WINDOW_DAYS),
        endsAt: vietnamMidnightOf((index + 1) * HERO_SEED_WINDOW_DAYS),
    };
};

export const normalizeViewerId = (viewerId) => {
    const id = String(viewerId ?? '').trim();
    // Signed-out visitors all share one seed; there is nothing to personalise on.
    return id && id !== 'undefined' && id !== 'null' ? id : ANONYMOUS_VIEWER;
};

/**
 * The seed is per viewer and per 3-day window: one account keeps the same
 * line-up for three days, then it rolls at Vietnam midnight. `salt` lets an
 * admin force a reshuffle without waiting for the window to turn over.
 */
export const getHeroSeed = ({ now = new Date(), salt = '', viewerId } = {}) => (
    `hero:${getHeroSeedWindow(now).key}:${normalizeViewerId(viewerId)}:${salt || 'default'}`
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
 * Picks the five hero posters: the two hottest movies, then three drawn by the
 * viewer's seed. The hot pair is the same for everyone, so the headline titles
 * stay consistent, while the remaining three vary per account.
 *
 * Candidate IDs are sorted before shuffling so the same pool plus the same seed
 * always yields the same three movies, whatever order MongoDB returned them in.
 */
export const selectHeroMovies = (movies, { now = new Date(), salt = '', viewerId } = {}) => {
    if (movies.length <= HERO_LIMIT) return movies.slice(0, HERO_LIMIT);

    const hottest = [...movies].sort(compareHotness).slice(0, HERO_HOT_COUNT);
    const hotIds = new Set(hottest.map((movie) => String(movie.id)));
    const remaining = new Map(
        movies.filter((movie) => !hotIds.has(String(movie.id)))
            .map((movie) => [String(movie.id), movie]),
    );
    const shuffledIds = getDeterministicPermutation(
        [...remaining.keys()].sort(),
        getHeroSeed({ now, salt, viewerId }),
    );
    const seeded = shuffledIds
        .slice(0, HERO_LIMIT - HERO_HOT_COUNT)
        .map((id) => remaining.get(id));

    return [...hottest, ...seeded];
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

const buildHeroPayload = ({ settings, movies, effectiveMode, now, viewerId }) => {
    const dateKey = getHeroPosterDateKey(now);
    const window = getHeroSeedWindow(now);
    const viewer = normalizeViewerId(viewerId);
    const personalized = effectiveMode === 'auto' && viewer !== ANONYMOUS_VIEWER;
    const seed = getHeroSeed({ now, salt: settings.seedSalt, viewerId: viewer });
    const nextRefreshAt = window.endsAt.toISOString();
    const version = `${effectiveMode}:${window.key}:${viewer}:${settings.updatedAt?.getTime?.() || settings.updatedAt || 'initial'}`;
    const meta = {
        version,
        dateKey,
        seed,
        seedWindow: window.key,
        seedWindowDays: HERO_SEED_WINDOW_DAYS,
        seedWindowStartsAt: window.startsAt.toISOString(),
        timezone: HERO_TIME_ZONE,
        generatedAt: now.toISOString(),
        nextRefreshAt,
        source: effectiveMode === 'manual' ? 'manual-selection' : 'seeded-poster-rotation',
        configuredMode: settings.mode,
        effectiveMode,
        hotCount: effectiveMode === 'manual' ? 0 : HERO_HOT_COUNT,
        // The controller reads this to decide whether the response may be cached
        // by anything shared: a per-account line-up must never be.
        personalized,
    };
    return {
        version,
        batchId: `poster-${window.key}`,
        batchKey: window.key,
        generatedAt: meta.generatedAt,
        nextRefreshAt,
        timezone: HERO_TIME_ZONE,
        dateKey,
        personalized,
        settings: { ...settings, effectiveMode },
        movies,
        rotation: {
            type: 'seeded-poster',
            dateKey,
            seed,
            windowDays: HERO_SEED_WINDOW_DAYS,
            hotCount: effectiveMode === 'manual' ? 0 : HERO_HOT_COUNT,
        },
        meta,
        cache: 'bypass',
    };
};

/**
 * The home Hero is poster-only: the two hottest movies plus three drawn by the
 * viewer's own seed, which rolls every three days at Vietnam midnight. Manual
 * mode overrides all five and is identical for everyone.
 */
export const getPublicHomeHero = async ({ now = new Date(), viewerId, preloaded = null } = {}) => {
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
        movies = selectHeroMovies(availableMovies, { now, salt: settings.seedSalt, viewerId });
        effectiveMode = 'auto';
    }
    if (movies.length !== HERO_LIMIT) {
        throw createHttpError(503, 'Five poster-ready movies are required for the home hero.', 'HERO_POOL_TOO_SMALL');
    }

    return buildHeroPayload({ settings, movies, effectiveMode, now, viewerId });
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
        // Previewed against the anonymous seed: that is the line-up signed-out
        // visitors get, and the salt shifts every account's draw alongside it.
        selected = selectHeroMovies(availableMovies, { now, salt: seedSalt });
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
