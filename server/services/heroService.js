import { createHash } from 'node:crypto';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import SiteConfig from '../models/SiteConfig.js';
import { deleteByPattern, deleteKeys, rememberJson } from './cacheService.js';
import { attachHeroVideos } from './heroVideoService.js';
import { getPublicHomeNowShowing } from './homeNowShowingService.js';
import { redisKeys, redisTtl } from './redisKeys.js';
import { hashSeed } from './seededRandom.js';
import { languageForCountry, loadMovieTranslations, pickMovieText } from './movieTitleService.js';
import { TMDB_MOVIE_GENRES, TMDB_REGION } from './tmdbConfig.js';
import { fetchTmdbJson } from './tmdbService.js';

const HERO_CONFIG_KEY = 'homeHero';
export const HERO_LIMIT = 5;
// The line-up is two of the newest, hottest releases followed by three classics.
export const HERO_HOT_COUNT = 2;
export const HERO_CLASSIC_COUNT = 3;
// The hot pair rotates daily through this many of the hottest releases, so the
// headline changes every day without dropping to a lukewarm title.
const HERO_HOT_POOL_SIZE = 6;
const HERO_CLASSIC_POOL_LIMIT = 60;
// Mirrors the catalog's classics bucket: at least 15 years old, well rated, and
// seen by enough people that the rating means something.
const CLASSIC_MIN_AGE_YEARS = 15;
const CLASSIC_MIN_RATING = 7.5;
const CLASSIC_MIN_VOTES = 1000;
// Fallback definition of "new" when the now-showing list is unavailable.
const RECENT_RELEASE_DAYS = 180;
const HERO_RANDOM_HISTORY_MS = 2 * 24 * 60 * 60 * 1000;
const HERO_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const HERO_TIME_ZONE_OFFSET_MS = 7 * 60 * 60 * 1000;
const MS_PER_DAY = 86400000;
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

// Day number since the epoch for the Vietnam calendar date, so windows can be
// counted in whole local days without any timezone drift.
const getVietnamDayOrdinal = (date = new Date()) => {
    const [year, month, day] = getHeroPosterDateKey(date).split('-').map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
};

// Vietnam midnight that starts the given local day, as a UTC instant.
const vietnamMidnightOf = (dayOrdinal) => new Date((dayOrdinal * MS_PER_DAY) - HERO_TIME_ZONE_OFFSET_MS);

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
        source: payload?.meta?.source || 'daily-poster-rotation',
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

/** The line-up is one per Vietnam day; `salt` lets an admin reshuffle early. */
export const getHeroSeed = ({ now = new Date(), salt = '' } = {}) => (
    `hero:${getHeroPosterDateKey(now)}:${salt || 'default'}`
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

const hasArt = (movie) => Boolean(movie?.backdrop_path || movie?.poster_path);

/**
 * Today's `count` movies from a pool. Each movie gets a stable place in a cycle
 * (ranked by a hash of its ID, so a movie joining or leaving the pool barely
 * disturbs the rest) and every day advances `count` places. Two consecutive days
 * therefore never share a movie while the pool holds at least twice `count`.
 */
export const pickDailyRotation = (movies, { count, now = new Date(), key = 'default' }) => {
    if (movies.length <= count) return movies.slice(0, count);
    const order = [...movies].sort((left, right) => (
        hashSeed(`${key}:${left.id}`) - hashSeed(`${key}:${right.id}`)
        || String(left.id).localeCompare(String(right.id))
    ));
    const start = (getVietnamDayOrdinal(now) * count) % order.length;
    return Array.from({ length: count }, (_, offset) => order[(start + offset) % order.length]);
};

/**
 * Picks the five hero posters: two of the newest, hottest releases first (the
 * hotter of the two leads), then three classics. Both halves rotate daily at
 * Vietnam midnight and the line-up is the same for everyone, so every poster is
 * a movie the showtime schedule covers.
 *
 * If one pool runs short, the other fills the gap rather than shipping a short
 * Hero; a pool that cannot fill five slots between them is the caller's 503.
 */
export const selectHeroMovies = ({ hot = [], classic = [] } = {}, { now = new Date(), salt = '' } = {}) => {
    const saltKey = salt || 'default';
    const hotPicks = pickDailyRotation(hot, { count: HERO_HOT_COUNT, now, key: `hero:hot:${saltKey}` })
        .sort(compareHotness);
    const taken = new Set(hotPicks.map((movie) => String(movie.id)));
    const classicPool = classic.filter((movie) => !taken.has(String(movie.id)));
    const classicPicks = pickDailyRotation(classicPool, {
        count: HERO_CLASSIC_COUNT,
        now,
        key: `hero:classic:${saltKey}`,
    });
    classicPicks.forEach((movie) => taken.add(String(movie.id)));

    const lineUp = [
        ...hotPicks.map((movie) => ({ ...movie, heroSlot: 'hot' })),
        ...classicPicks.map((movie) => ({ ...movie, heroSlot: 'classic' })),
    ];
    const leftovers = [...hot, ...classic].filter((movie) => !taken.has(String(movie.id)));
    for (const movie of leftovers) {
        if (lineUp.length >= HERO_LIMIT) break;
        if (taken.has(String(movie.id))) continue;
        taken.add(String(movie.id));
        lineUp.push({ ...movie, heroSlot: 'fill' });
    }
    return lineUp.slice(0, HERO_LIMIT);
};

// The site serves Vietnam, so a classic only makes the Hero when TMDB has its
// title and synopsis in Vietnamese; otherwise it would be the one English poster.
const HERO_TRANSLATION_LANGUAGE = languageForCountry(TMDB_REGION);
// Each round swaps out at most three classics, so this bounds the lookups.
const MAX_CLASSIC_TRANSLATION_ROUNDS = 8;

export const hasHeroTranslation = async (movie, { loadTranslations = loadMovieTranslations } = {}) => {
    try {
        const text = pickMovieText(await loadTranslations(String(movie.id)), HERO_TRANSLATION_LANGUAGE);
        return Boolean(text.title && text.overview);
    } catch (error) {
        // An unreachable TMDB must not empty the Hero, so an unknown counts as translated.
        console.warn(JSON.stringify({
            event: 'hero-translation-check-unavailable',
            movieId: movie.id,
            errorCode: error?.code || error?.name || 'UNKNOWN',
        }));
        return true;
    }
};

/**
 * selectHeroMovies, but every classic in the result has a Vietnamese title and
 * synopsis. Untranslated classics are dropped from the pool and the rotation
 * runs again, so the daily cycle is kept for everything that remains.
 */
export const selectTranslatedHeroMovies = async (pools, options = {}, { isTranslated = hasHeroTranslation } = {}) => {
    const rejected = new Set();
    let lineUp = selectHeroMovies(pools, options);
    for (let round = 0; round < MAX_CLASSIC_TRANSLATION_ROUNDS; round += 1) {
        const classics = lineUp.filter((movie) => movie.heroSlot !== 'hot');
        const checks = await Promise.all(classics.map((movie) => isTranslated(movie)));
        const untranslated = classics.filter((_, index) => !checks[index]);
        if (!untranslated.length) return lineUp;
        untranslated.forEach((movie) => rejected.add(String(movie.id)));
        const classic = pools.classic.filter((movie) => !rejected.has(String(movie.id)));
        // Keep the last good line-up rather than shipping a short Hero.
        if (classic.length < HERO_CLASSIC_COUNT) return lineUp;
        lineUp = selectHeroMovies({ ...pools, classic }, options);
    }
    return lineUp;
};

const releaseDateKeyDaysAgo = (now, days) => getHeroPosterDateKey(new Date(now.getTime() - (days * MS_PER_DAY)));

// Now-showing entries carry no runtime and only genre IDs. The two posters that
// actually make the Hero borrow both from the cached TMDB details the movie page
// already uses; any failure just leaves those fields out.
const enrichHotMovie = async (movie) => {
    if (movie.runtime && movie.genres.length) return movie;
    try {
        const { value } = await rememberJson(
            redisKeys.tmdbMovie(movie.id),
            redisTtl.movie,
            () => fetchTmdbJson(`/movie/${movie.id}`, { language: 'en-US', append_to_response: 'credits' }),
        );
        const details = normalizeHeroMovie({ ...value, _id: movie.id });
        return {
            ...movie,
            runtime: movie.runtime || details?.runtime || null,
            genres: movie.genres.length ? movie.genres : (details?.genres || []),
        };
    } catch (error) {
        console.warn(JSON.stringify({
            event: 'hero-movie-details-unavailable',
            movieId: movie.id,
            errorCode: error?.code || error?.name || 'UNKNOWN',
        }));
        return movie;
    }
};

/**
 * Newest and hottest: the now-showing list, which is already the current VN
 * releases ranked by popularity. When it is unavailable, recent releases from the
 * database stand in so the Hero still leads with new titles.
 */
const loadHotPool = async ({ now, loadNowShowing }) => {
    try {
        const result = await loadNowShowing({ limit: 20, now });
        const movies = (result?.value?.results || []).map(normalizeHeroMovie).filter(hasArt);
        if (movies.length >= HERO_HOT_COUNT) {
            return { movies: movies.slice(0, HERO_HOT_POOL_SIZE), source: 'now-showing' };
        }
    } catch (error) {
        console.warn(JSON.stringify({
            event: 'hero-hot-pool-now-showing-unavailable',
            errorCode: error?.code || error?.name || 'UNKNOWN',
        }));
    }

    const recent = await Movie.find({
        release_date: { $gte: releaseDateKeyDaysAgo(now, RECENT_RELEASE_DAYS), $lte: getHeroPosterDateKey(now) },
    })
        .select(MOVIE_SELECT)
        .sort({ popularity: -1, release_date: -1, _id: 1 })
        .limit(HERO_HOT_POOL_SIZE)
        .lean();
    return { movies: recent.map(normalizeHeroMovie).filter(hasArt), source: 'recent-releases' };
};

const loadClassicPool = async ({ now }) => {
    const cutoff = `${Number(getHeroPosterDateKey(now).slice(0, 4)) - CLASSIC_MIN_AGE_YEARS}-12-31`;
    const released = { $gte: '1900-01-01', $lte: cutoff };
    const strict = await Movie.find({
        release_date: released,
        vote_average: { $gte: CLASSIC_MIN_RATING },
        vote_count: { $gte: CLASSIC_MIN_VOTES },
    })
        .select(MOVIE_SELECT)
        .sort({ vote_count: -1, _id: 1 })
        .limit(HERO_CLASSIC_POOL_LIMIT)
        .lean();
    const movies = strict.map(normalizeHeroMovie).filter(hasArt);
    if (movies.length >= HERO_CLASSIC_COUNT) return movies;

    // A thin catalog still gets old titles, best rated first, before anything else.
    const relaxed = await Movie.find({ release_date: released })
        .select(MOVIE_SELECT)
        .sort({ vote_average: -1, _id: 1 })
        .limit(HERO_CLASSIC_POOL_LIMIT)
        .lean();
    return relaxed.map(normalizeHeroMovie).filter(hasArt);
};

export const loadHeroPools = async ({ now = new Date(), loadNowShowing = getPublicHomeNowShowing } = {}) => {
    const [hot, classic] = await Promise.all([
        loadHotPool({ now, loadNowShowing }),
        loadClassicPool({ now }),
    ]);
    return { hot: hot.movies, classic, hotSource: hot.source };
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

const buildHeroPayload = ({ settings, movies, effectiveMode, now, hotSource }) => {
    const dateKey = getHeroPosterDateKey(now);
    const seed = getHeroSeed({ now, salt: settings.seedSalt });
    const nextRefreshAt = vietnamMidnightOf(getVietnamDayOrdinal(now) + 1).toISOString();
    const hotCount = effectiveMode === 'manual' ? 0 : movies.filter((movie) => movie.heroSlot === 'hot').length;
    const classicCount = effectiveMode === 'manual' ? 0 : movies.filter((movie) => movie.heroSlot === 'classic').length;
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
        hotCount,
        classicCount,
        hotSource: effectiveMode === 'manual' ? null : hotSource,
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
        rotation: { type: 'daily-poster', dateKey, seed, hotCount, classicCount },
        meta,
        cache: 'bypass',
    };
};

/**
 * The home Hero is poster-only and the same for every visitor: two of the newest,
 * hottest releases, then three classics, rotating at Vietnam midnight. Manual
 * mode overrides all five.
 */
export const getPublicHomeHero = async ({
    now = new Date(),
    preloaded = null,
    loadNowShowing = getPublicHomeNowShowing,
    isTranslated = hasHeroTranslation,
} = {}) => {
    const { settings, pools } = preloaded || {
        settings: await getHomeHeroConfig(),
        pools: null,
    };

    let movies = [];
    let effectiveMode = 'auto';
    let hotSource = null;
    if (settings.mode === 'manual' && settings.movieIds.length === HERO_LIMIT) {
        movies = await loadMoviesByIds(settings.movieIds);
        if (movies.length === HERO_LIMIT) effectiveMode = 'manual';
    }
    if (movies.length !== HERO_LIMIT) {
        const heroPools = pools || await loadHeroPools({ now, loadNowShowing });
        hotSource = heroPools.hotSource;
        movies = await selectTranslatedHeroMovies(heroPools, { now, salt: settings.seedSalt }, { isTranslated });
        movies = await Promise.all(movies.map((movie) => (
            movie.heroSlot === 'hot' ? enrichHotMovie(movie) : movie
        )));
        effectiveMode = 'auto';
    }
    if (movies.length !== HERO_LIMIT) {
        throw createHttpError(503, 'Five poster-ready movies are required for the home hero.', 'HERO_POOL_TOO_SMALL');
    }

    return buildHeroPayload({ settings, movies: attachHeroVideos(movies), effectiveMode, now, hotSource });
};

export const getAdminHomeHero = async ({ now = new Date(), loadNowShowing = getPublicHomeNowShowing } = {}) => {
    // Loaded once and handed to getPublicHomeHero, so an admin request does not
    // repeat the pool queries. The wider 150-movie pool is for manual picks.
    const [settings, pools, availableMovies] = await Promise.all([
        getHomeHeroConfig(),
        loadHeroPools({ now, loadNowShowing }),
        loadAvailablePosterMovies(),
    ]);
    const [liveHero, selectedMovies] = await Promise.all([
        getPublicHomeHero({ now, preloaded: { settings, pools } }),
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
export const randomizeHomeHero = async ({ now = new Date(), loadNowShowing = getPublicHomeNowShowing } = {}) => {
    const pools = await loadHeroPools({ now, loadNowShowing });
    if (selectHeroMovies(pools, { now }).length < HERO_LIMIT) {
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
        selected = selectHeroMovies(pools, { now, salt: seedSalt });
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
    return getAdminHomeHero({ now, loadNowShowing });
};

export default {
    getPublicHomeHero,
    getAdminHomeHero,
    updateHomeHero,
    randomizeHomeHero,
    createHeroEtag,
    matchesHeroEtag,
};
