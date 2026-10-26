import { createHash, randomInt } from 'node:crypto';
import HeroRotation from '../models/HeroRotation.js';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import SiteConfig from '../models/SiteConfig.js';
import { deleteByPattern, deleteKeys } from './cacheService.js';
import { attachHeroVideos } from './heroVideoService.js';
import { redisKeys } from './redisKeys.js';
import { TMDB_MOVIE_GENRES } from './tmdbConfig.js';

const HERO_CONFIG_KEY = 'homeHero';
export const HERO_LIMIT = 5;
// The line-up turns over at 00:00 and 12:00 Vietnam time.
export const HERO_ROTATION_HOURS = 12;
const HERO_ROTATION_MS = HERO_ROTATION_HOURS * 60 * 60 * 1000;
// Upper bound on the rotation pool, far above the catalog's size, so a runaway
// collection cannot turn every Hero request into a full scan.
const HERO_ROTATION_POOL_LIMIT = 2000;
// A movie stays off the Hero for this long after it was shown.
export const HERO_NO_REPEAT_DAYS = 30;
const HERO_NO_REPEAT_MS = HERO_NO_REPEAT_DAYS * 24 * 60 * 60 * 1000;
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
        source: payload?.meta?.source || 'newest-rotation',
        version: payload?.version ?? 0,
        dateKey: payload?.dateKey || '',
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

const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

// Newest release first. Popularity orders films released on the same day, and
// the ID keeps the order stable when nothing else differs.
const compareNewest = (left, right) => (
    String(right.release_date || '').localeCompare(String(left.release_date || ''))
    || toNumber(right.popularity) - toNumber(left.popularity)
    || String(left.id).localeCompare(String(right.id))
);

/**
 * A slot's five movies: the newest released movies that have not been on the
 * Hero in the last 30 days (`lastShownAt` maps a movie ID to when its slot
 * started). The first slot is therefore the five newest releases, each later
 * slot the next five, and a release added to the catalog goes up in the very
 * next slot.
 *
 * When fewer than five are left, the movies shown longest ago fill the gap, so
 * a small catalog repeats as late as possible instead of shipping a short Hero.
 */
export const selectHeroMovies = (pool = [], { lastShownAt = new Map() } = {}) => {
    const picks = pool
        .filter((movie) => !lastShownAt.has(movie.id))
        .sort(compareNewest)
        .slice(0, HERO_LIMIT);
    if (picks.length < HERO_LIMIT) {
        const longestAgo = pool
            .filter((movie) => lastShownAt.has(movie.id))
            .sort((left, right) => lastShownAt.get(left.id) - lastShownAt.get(right.id) || compareNewest(left, right));
        picks.push(...longestAgo.slice(0, HERO_LIMIT - picks.length));
    }
    return picks;
};

/**
 * Every released movie in the catalog with artwork. Only what the ordering
 * needs is read; the five picked movies are loaded in full afterwards.
 */
export const loadHeroPool = async ({ now = new Date() } = {}) => {
    const movies = await Movie.find({
        adult: { $ne: true },
        // Released by today: an upcoming title cannot be watched yet.
        release_date: { $gte: '1900-01-01', $lte: getHeroPosterDateKey(now) },
        $or: [
            { backdrop_path: { $nin: [null, ''] } },
            { poster_path: { $nin: [null, ''] } },
        ],
    })
        .select('_id release_date popularity')
        .sort({ release_date: -1, _id: 1 })
        .limit(HERO_ROTATION_POOL_LIMIT)
        .lean();
    return movies.map((movie) => ({
        id: String(movie._id),
        release_date: movie.release_date,
        popularity: movie.popularity,
    }));
};

// When each movie was last on the Hero, over the 30 days before `startsAt`.
const loadLastShownAt = async (startsAt) => {
    const slots = await HeroRotation.find({
        startsAt: { $gt: new Date(startsAt.getTime() - HERO_NO_REPEAT_MS), $lt: startsAt },
    })
        .select('startsAt movieIds shownMovieIds')
        .lean();
    const lastShownAt = new Map();
    for (const slot of slots) {
        const shownAt = new Date(slot.startsAt).getTime();
        for (const id of [...(slot.movieIds || []), ...(slot.shownMovieIds || [])]) {
            if ((lastShownAt.get(id) ?? -Infinity) < shownAt) lastShownAt.set(id, shownAt);
        }
    }
    return lastShownAt;
};

// History plus the slot's own posters, so a reshuffle never brings one back.
const loadShownBeforeOrDuring = async (slot) => {
    const startsAt = new Date(slot.startsAt);
    const lastShownAt = await loadLastShownAt(startsAt);
    (slot.shownMovieIds || []).forEach((id) => lastShownAt.set(id, startsAt.getTime()));
    return lastShownAt;
};

const reportRepeats = (rotationKey, reusedCount, poolSize) => {
    if (!reusedCount) return;
    console.warn(JSON.stringify({
        event: 'hero-rotation-repeats-within-window',
        rotationKey,
        reusedCount,
        poolSize,
        noRepeatDays: HERO_NO_REPEAT_DAYS,
    }));
};

/**
 * The current slot's record. The first request of a slot picks its line-up and
 * stores it; every later request, from any visitor or server instance, reads
 * that same line-up, and the stored slots are the history later slots avoid.
 */
const resolveHeroSlot = async ({ now, pool = null }) => {
    const rotationKey = getHeroRotationKey(now);
    const existing = await HeroRotation.findById(rotationKey).lean();
    if (existing) return existing;

    const startsAt = heroSlotStart(getHeroSlotOrdinal(now));
    const heroPool = pool || await loadHeroPool({ now });
    const lastShownAt = await loadLastShownAt(startsAt);
    const picks = selectHeroMovies(heroPool, { lastShownAt });
    const movieIds = picks.map((movie) => movie.id);
    const reusedCount = picks.filter((movie) => lastShownAt.has(movie.id)).length;
    try {
        const created = await HeroRotation.create({
            _id: rotationKey,
            startsAt,
            movieIds,
            shownMovieIds: movieIds,
            reusedCount,
        });
        reportRepeats(rotationKey, reusedCount, heroPool.length);
        return typeof created.toObject === 'function' ? created.toObject() : created;
    } catch (error) {
        // Another request opened this slot first; its line-up stands.
        if (error?.code === 11000) {
            const winner = await HeroRotation.findById(rotationKey).lean();
            if (winner) return winner;
        }
        throw error;
    }
};

/**
 * The slot's line-up as full movies. A movie removed from the catalog after the
 * slot started gives its place to the newest movie not shown recently.
 */
const loadSlotMovies = async (slot, { now }) => {
    const movies = await loadMoviesByIds(slot.movieIds);
    if (movies.length === HERO_LIMIT) return movies;

    const kept = new Set(movies.map((movie) => movie.id));
    const lastShownAt = await loadShownBeforeOrDuring(slot);
    const pool = (await loadHeroPool({ now })).filter((movie) => !kept.has(movie.id));
    const movieIds = [...kept, ...selectHeroMovies(pool, { lastShownAt }).map((movie) => movie.id)].slice(0, HERO_LIMIT);
    await HeroRotation.updateOne(
        { _id: slot._id },
        { $set: { movieIds }, $addToSet: { shownMovieIds: { $each: movieIds } } },
    );
    return loadMoviesByIds(movieIds);
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

const buildHeroPayload = ({ settings, movies, effectiveMode, now, reusedCount = 0 }) => {
    const dateKey = getHeroPosterDateKey(now);
    const rotationKey = getHeroRotationKey(now);
    const slot = getHeroSlotOrdinal(now);
    const startsAt = heroSlotStart(slot).toISOString();
    const nextRefreshAt = heroSlotStart(slot + 1).toISOString();
    const version = `${effectiveMode}:${rotationKey}:${settings.updatedAt?.getTime?.() || settings.updatedAt || 'initial'}`;
    const isManual = effectiveMode === 'manual';
    const meta = {
        version,
        dateKey,
        rotationKey,
        rotationHours: HERO_ROTATION_HOURS,
        noRepeatDays: HERO_NO_REPEAT_DAYS,
        reusedCount: isManual ? 0 : reusedCount,
        timezone: HERO_TIME_ZONE,
        generatedAt: now.toISOString(),
        nextRefreshAt,
        source: isManual ? 'manual-selection' : 'newest-rotation',
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
            type: 'newest-rotation',
            key: rotationKey,
            hours: HERO_ROTATION_HOURS,
            noRepeatDays: HERO_NO_REPEAT_DAYS,
            dateKey,
            startsAt,
            endsAt: nextRefreshAt,
        },
        meta,
        cache: 'bypass',
    };
};

/**
 * The home Hero is the same for every visitor. Every 12 hours (00:00 and 12:00
 * Vietnam time) it shows the five newest released movies that have not been on
 * it in the last 30 days, newest first. Manual mode overrides all five.
 */
export const getPublicHomeHero = async ({ now = new Date(), preloaded = null } = {}) => {
    const settings = preloaded?.settings || await getHomeHeroConfig();

    let movies = [];
    let effectiveMode = 'auto';
    let reusedCount = 0;
    if (settings.mode === 'manual' && settings.movieIds.length === HERO_LIMIT) {
        movies = await loadMoviesByIds(settings.movieIds);
        if (movies.length === HERO_LIMIT) effectiveMode = 'manual';
    }
    if (movies.length !== HERO_LIMIT) {
        const slot = await resolveHeroSlot({ now });
        movies = await loadSlotMovies(slot, { now });
        reusedCount = slot.reusedCount || 0;
        effectiveMode = 'auto';
    }
    if (movies.length !== HERO_LIMIT) {
        throw createHttpError(503, 'Five poster-ready movies are required for the home hero.', 'HERO_POOL_TOO_SMALL');
    }

    return buildHeroPayload({ settings, movies: attachHeroVideos(movies), effectiveMode, now, reusedCount });
};

export const getAdminHomeHero = async ({ now = new Date() } = {}) => {
    // The config is read once and handed to getPublicHomeHero. The 150-movie list
    // is for manual picks.
    const [settings, availableMovies] = await Promise.all([
        getHomeHeroConfig(),
        loadAvailablePosterMovies(),
    ]);
    const [liveHero, selectedMovies] = await Promise.all([
        getPublicHomeHero({ now, preloaded: { settings } }),
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
 * Swaps the current slot's line-up for five random movies that have not been on
 * the Hero in the last 30 days. The posters swapped out still count as shown.
 */
export const randomizeHomeHero = async ({ now = new Date() } = {}) => {
    const pool = await loadHeroPool({ now });
    if (pool.length < HERO_LIMIT) {
        throw createHttpError(400, `At least ${HERO_LIMIT} movies are required to randomize the Hero.`, 'HERO_POOL_TOO_SMALL');
    }
    const slot = await resolveHeroSlot({ now, pool });
    const lastShownAt = await loadShownBeforeOrDuring(slot);
    const unshown = pool.filter((movie) => !lastShownAt.has(movie.id));
    for (let index = unshown.length - 1; index > 0; index -= 1) {
        const target = randomInt(index + 1);
        [unshown[index], unshown[target]] = [unshown[target], unshown[index]];
    }
    const picks = unshown.slice(0, HERO_LIMIT).sort(compareNewest);
    if (picks.length < HERO_LIMIT) {
        const taken = new Set(picks.map((movie) => movie.id));
        const rest = pool.filter((movie) => !taken.has(movie.id));
        picks.push(...selectHeroMovies(rest, { lastShownAt }).slice(0, HERO_LIMIT - picks.length));
    }
    const movieIds = picks.map((movie) => movie.id);
    const reusedCount = picks.filter((movie) => lastShownAt.has(movie.id)).length;

    await HeroRotation.updateOne(
        { _id: slot._id },
        { $set: { movieIds, reusedCount }, $addToSet: { shownMovieIds: { $each: movieIds } } },
    );
    reportRepeats(slot._id, reusedCount, pool.length);
    await SiteConfig.findOneAndUpdate(
        { key: HERO_CONFIG_KEY },
        // Back to auto mode, so the rotation carries on from this line-up.
        { $setOnInsert: { key: HERO_CONFIG_KEY }, $set: { 'homeHero.mode': 'auto' } },
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
