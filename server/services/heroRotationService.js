import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import CatalogBatch from '../models/CatalogBatch.js';
import HeroRotationBatch from '../models/HeroRotationBatch.js';
import Movie from '../models/Movie.js';
import SiteConfig from '../models/SiteConfig.js';
import {
    HERO_DEFAULT_VOLUME,
    HERO_MIN_VOTE_AVERAGE,
    HERO_MIN_VOTE_COUNT,
    HERO_REFRESH_INTERVAL_HOURS,
    HERO_REFRESH_TIMEZONE,
    HERO_REQUIRE_NATIVE_VIDEO,
    HERO_VIDEO_ALLOWED_HOSTS,
    HERO_VIDEO_MAX_BYTES,
    HERO_VIDEO_MAX_DURATION_SECONDS,
    HERO_VIDEO_MIN_HEIGHT,
    HERO_VIDEO_MIN_WIDTH,
    isHeroVideoCodecPairSupported,
} from '../configs/heroRotation.js';
import {
    acquireFencedLock,
    releaseFencedLock,
    renewFencedLock,
    verifyFencedLock,
} from './lockService.js';
import {
    deleteByPattern,
    deleteKeys,
    getJson,
    setJson,
    setRequiredJson,
} from './cacheService.js';
import { getDeterministicPermutation } from './catalogRefreshService.js';
import { redisKeys, redisTtl } from './redisKeys.js';

export {
    HERO_MIN_VOTE_AVERAGE,
    HERO_MIN_VOTE_COUNT,
    HERO_REFRESH_INTERVAL_HOURS,
    HERO_REFRESH_TIMEZONE,
    HERO_REQUIRE_NATIVE_VIDEO,
};
export const HERO_POOL_GROUP_SIZE = 5;
export const HERO_POOL_SIZE = 15;
export const HERO_ACTIVE_SIZE = 5;

export const heroRotationRuntime = {
    acquireFencedLock,
    deleteByPattern,
    deleteKeys,
    getJson,
    releaseFencedLock,
    renewFencedLock,
    setJson,
    setRequiredJson,
    verifyFencedLock,
    buildPool: (...args) => buildHeroPoolFromCatalog(...args),
    getPublicRotation: (...args) => getPublicHeroRotation(...args),
};

const MOVIE_PUBLIC_SELECT = [
    '_id',
    'title',
    'overview',
    'poster_path',
    'backdrop_path',
    'release_date',
    'vote_average',
    'vote_count',
    'popularity',
    'adult',
    'runtime',
    'genres',
    'heroVideoId',
    'heroVideoMovieId',
    'heroVideoUrl',
    'heroVideoMimeType',
    'heroVideoPosterUrl',
    'heroVideoStatus',
    'heroVideoVersion',
    'heroVideoDuration',
    'heroVideoWidth',
    'heroVideoHeight',
    'heroVideoBytes',
    'heroVideoCodec',
    'heroVideoVerifiedAt',
    'heroVideoSource',
    'heroVideoAttribution',
].join(' ');

const SUPPORTED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm']);

export class HeroRotationError extends Error {
    constructor(code, message, { status = 409, transient = false, details, cause } = {}) {
        super(message, { cause });
        this.name = 'HeroRotationError';
        this.code = code;
        this.status = status;
        this.statusCode = status;
        this.transient = transient;
        this.details = details;
    }
}

export const shouldRetryHeroRefreshError = (error) => error?.transient !== false;

const parseAllowedHosts = (value = HERO_VIDEO_ALLOWED_HOSTS) => {
    const configured = String(value || '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean);
    return new Set(configured.length ? configured : HERO_VIDEO_ALLOWED_HOSTS);
};

const getZonedParts = (date, timezone = HERO_REFRESH_TIMEZONE) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    });
    const parts = Object.fromEntries(
        formatter.formatToParts(date)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, Number(part.value)]),
    );
    return {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: parts.hour,
        minute: parts.minute,
        second: parts.second,
    };
};

const getTimezoneOffsetMs = (date, timezone) => {
    const parts = getZonedParts(date, timezone);
    const asUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
    );
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
};

const zonedDateTimeToUtc = (parts, timezone = HERO_REFRESH_TIMEZONE) => {
    const utcGuess = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour || 0,
        parts.minute || 0,
        parts.second || 0,
    );
    let result = utcGuess;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        result = utcGuess - getTimezoneOffsetMs(new Date(result), timezone);
    }
    return new Date(result);
};

export const getHeroLocalDateKey = (date = new Date(), timezone = HERO_REFRESH_TIMEZONE) => {
    const parts = getZonedParts(date, timezone);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};

export const getHeroRefreshWindow = (
    date = new Date(),
    timezone = HERO_REFRESH_TIMEZONE,
    intervalHours = HERO_REFRESH_INTERVAL_HOURS,
) => {
    if (timezone !== 'Asia/Ho_Chi_Minh') {
        // Intl handles other zones, but keeping the configured zone explicit prevents
        // silently changing the production scheduling contract.
        getZonedParts(date, timezone);
    }
    const local = getZonedParts(date, timezone);
    const localOrdinal = Math.floor(Date.UTC(local.year, local.month - 1, local.day) / 86400000);
    const intervalDays = Math.max(1, Math.round(intervalHours / 24));
    const windowOrdinal = Math.floor(localOrdinal / intervalDays) * intervalDays;
    const windowDate = new Date(windowOrdinal * 86400000);
    const start = zonedDateTimeToUtc({
        year: windowDate.getUTCFullYear(),
        month: windowDate.getUTCMonth() + 1,
        day: windowDate.getUTCDate(),
    }, timezone);
    const nextLocal = new Date((windowOrdinal + intervalDays) * 86400000);
    const end = zonedDateTimeToUtc({
        year: nextLocal.getUTCFullYear(),
        month: nextLocal.getUTCMonth() + 1,
        day: nextLocal.getUTCDate(),
    }, timezone);
    return {
        key: `hero-${getHeroLocalDateKey(start, timezone)}`,
        startsAt: start,
        nextRefreshAt: end,
        timezone,
        intervalHours,
    };
};

export const calculateNextHeroRefreshAt = (
    refreshedAt = new Date(),
    timezone = HERO_REFRESH_TIMEZONE,
    intervalHours = HERO_REFRESH_INTERVAL_HOURS,
) => {
    const local = getZonedParts(refreshedAt, timezone);
    const intervalDays = Math.max(1, Math.round(intervalHours / 24));
    const minimumDueAt = refreshedAt.getTime() + (intervalHours * 60 * 60 * 1000);
    let dayOffset = intervalDays;
    let candidate;
    do {
        const targetLocal = new Date(Date.UTC(
            local.year,
            local.month - 1,
            local.day + dayOffset,
        ));
        candidate = zonedDateTimeToUtc({
            year: targetLocal.getUTCFullYear(),
            month: targetLocal.getUTCMonth() + 1,
            day: targetLocal.getUTCDate(),
        }, timezone);
        dayOffset += 1;
    } while (candidate.getTime() < minimumDueAt);
    return candidate;
};

export const isHeroRefreshDue = ({ now = new Date(), nextRefreshAt } = {}) => {
    if (!nextRefreshAt) return true;
    const dueAt = new Date(nextRefreshAt);
    return Number.isNaN(dueAt.getTime()) || now.getTime() >= dueAt.getTime();
};

const normalizeIds = (values = []) => values.map(String).filter(Boolean);

const pickPreferred = (orderedIds, previousSet) => (
    orderedIds.find((id) => !previousSet.has(id)) || orderedIds[0]
);

export const selectActiveHeroMovieIds = ({
    newestMovieIds,
    hotMovieIds,
    discoveryMovieIds,
    selectionSeed,
    previousHeroMovieIds = [],
}) => {
    const groups = [
        normalizeIds(newestMovieIds),
        normalizeIds(hotMovieIds),
        normalizeIds(discoveryMovieIds),
    ];
    if (groups.some((group) => group.length !== HERO_POOL_GROUP_SIZE || new Set(group).size !== HERO_POOL_GROUP_SIZE)) {
        throw new HeroRotationError('HERO_POOL_INVALID', 'Each Hero category must contain exactly five unique movies.');
    }
    const pool = groups.flat();
    if (new Set(pool).size !== HERO_POOL_SIZE) {
        throw new HeroRotationError('HERO_POOL_OVERLAP', 'Hero category movie IDs must be globally unique.');
    }
    const previousSet = new Set(normalizeIds(previousHeroMovieIds));
    const selected = [];
    const selectedSet = new Set();
    groups.forEach((group, index) => {
        const ordered = getDeterministicPermutation(group, `${selectionSeed}:required:${index}`);
        const picked = pickPreferred(ordered, previousSet);
        selected.push(picked);
        selectedSet.add(picked);
    });
    const remaining = getDeterministicPermutation(
        pool.filter((id) => !selectedSet.has(id)),
        `${selectionSeed}:remaining`,
    );
    const preferred = [
        ...remaining.filter((id) => !previousSet.has(id)),
        ...remaining.filter((id) => previousSet.has(id)),
    ];
    for (const id of preferred) {
        if (selected.length === HERO_ACTIVE_SIZE) break;
        if (!selectedSet.has(id)) {
            selected.push(id);
            selectedSet.add(id);
        }
    }
    if (selected.length !== HERO_ACTIVE_SIZE || selectedSet.size !== HERO_ACTIVE_SIZE) {
        throw new HeroRotationError('HERO_SELECTION_INVALID', 'Unable to select five unique Hero movies.');
    }
    return selected;
};

export const validateNativeHeroMovie = (
    movie,
    {
        allowedHosts = parseAllowedHosts(),
        requireMetadata = true,
    } = {},
) => {
    const movieId = String(movie?._id || movie?.id || '');
    const reasons = [];
    const mimeType = String(movie?.heroVideoMimeType || '').toLowerCase();
    if (!movieId) reasons.push('missing-movie-id');
    if (movie?.heroVideoStatus !== 'ready') reasons.push('status-not-ready');
    if (String(movie?.heroVideoMovieId || '') !== movieId) reasons.push('movie-binding-mismatch');
    if (!SUPPORTED_VIDEO_MIME_TYPES.has(mimeType)) {
        reasons.push('unsupported-mime');
    }
    let parsedUrl = null;
    try {
        parsedUrl = new URL(String(movie?.heroVideoUrl || ''));
        if (parsedUrl.protocol !== 'https:') reasons.push('video-url-not-https');
        if (!allowedHosts.has(parsedUrl.hostname.toLowerCase())) reasons.push('video-host-not-allowed');
    } catch {
        reasons.push('invalid-video-url');
    }
    if (String(movie?.heroVideoUrl || '').includes('/mock/')) reasons.push('mock-video');
    if (/hero_trailers\/(?:action_|sci_fi_|drama_|romance_|animation_|family_|horror_|thriller_|comedy_|cinematic_)/i.test(String(movie?.heroVideoId || ''))) {
        reasons.push('generic-video');
    }
    if (requireMetadata) {
        const duration = Number(movie?.heroVideoDuration);
        const width = Number(movie?.heroVideoWidth);
        const height = Number(movie?.heroVideoHeight);
        const bytes = Number(movie?.heroVideoBytes);
        const [videoCodec = '', audioCodec = '', extraCodec = ''] = String(
            movie?.heroVideoCodec || '',
        ).toLowerCase().split('/');
        if (!(duration > 0)) reasons.push('missing-duration');
        else if (duration > HERO_VIDEO_MAX_DURATION_SECONDS) reasons.push('duration-out-of-range');
        if (!(width > 0) || !(height > 0)) reasons.push('missing-dimensions');
        else if (width < HERO_VIDEO_MIN_WIDTH || height < HERO_VIDEO_MIN_HEIGHT) {
            reasons.push('dimensions-out-of-range');
        }
        if (!(bytes > 0)) reasons.push('missing-bytes');
        else if (bytes > HERO_VIDEO_MAX_BYTES) reasons.push('bytes-out-of-range');
        if (
            extraCodec
            || !isHeroVideoCodecPairSupported({ mimeType, videoCodec, audioCodec })
        ) {
            reasons.push('unsupported-codec-pair');
        }
        if (!String(movie?.heroVideoVersion || '').trim()) reasons.push('missing-video-version');
        if (!String(movie?.heroVideoPosterUrl || '').trim()) reasons.push('missing-video-poster');
        if (!movie?.heroVideoVerifiedAt) reasons.push('not-verified');
    }
    return {
        valid: reasons.length === 0,
        reasons,
        movieId,
        normalizedUrl: parsedUrl?.toString() || '',
    };
};

export const assertHeroPoolAssetsReady = ({
    movies,
    expectedMovieIds,
}) => {
    const expectedIds = normalizeIds(expectedMovieIds);
    const expectedSet = new Set(expectedIds);
    const byId = new Map(
        (Array.isArray(movies) ? movies : [])
            .map((movie) => [String(movie?._id || movie?.id || ''), movie])
            .filter(([id]) => id),
    );
    const validations = expectedIds.map((movieId) => {
        const movie = byId.get(movieId);
        return movie
            ? validateNativeHeroMovie(movie)
            : { valid: false, movieId, reasons: ['movie-not-found'] };
    });
    const urls = expectedIds.map((movieId) => String(byId.get(movieId)?.heroVideoUrl || ''));
    const duplicateUrls = urls.filter((url, index) => (
        url && urls.indexOf(url) !== index
    ));
    if (
        expectedIds.length !== HERO_POOL_SIZE
        || expectedSet.size !== HERO_POOL_SIZE
        || byId.size < HERO_POOL_SIZE
        || validations.some((validation) => !validation.valid)
        || new Set(urls).size !== HERO_POOL_SIZE
    ) {
        throw new HeroRotationError(
            'HERO_POOL_ASSETS_CHANGED',
            'Hero pool assets changed before activation; the previous active batch was preserved.',
            {
                status: 409,
                details: {
                    expectedMovieCount: expectedIds.length,
                    resolvedMovieCount: expectedIds.filter((id) => byId.has(id)).length,
                    duplicateUrls: [...new Set(duplicateUrls)],
                    invalid: validations
                        .filter((validation) => !validation.valid)
                        .map(({ movieId, reasons }) => ({ movieId, reasons })),
                },
            },
        );
    }
    return true;
};

export const assertHeroActiveAssetsReady = ({
    movies,
    expectedMovieIds,
}) => {
    const expectedIds = normalizeIds(expectedMovieIds);
    const byId = new Map(
        (Array.isArray(movies) ? movies : [])
            .map((movie) => [String(movie?._id || movie?.id || ''), movie])
            .filter(([id]) => id),
    );
    const validations = expectedIds.map((movieId) => {
        const movie = byId.get(movieId);
        return movie
            ? validateNativeHeroMovie(movie)
            : { valid: false, movieId, reasons: ['movie-not-found'] };
    });
    const urls = expectedIds.map((movieId) => String(byId.get(movieId)?.heroVideoUrl || ''));
    if (
        expectedIds.length !== HERO_ACTIVE_SIZE
        || new Set(expectedIds).size !== HERO_ACTIVE_SIZE
        || byId.size < HERO_ACTIVE_SIZE
        || validations.some((validation) => !validation.valid)
        || new Set(urls).size !== HERO_ACTIVE_SIZE
    ) {
        throw new HeroRotationError(
            'HERO_ACTIVE_ASSETS_CHANGED',
            'The selected Hero movies no longer have five unique verified native trailers.',
            {
                status: 409,
                details: {
                    expectedMovieCount: expectedIds.length,
                    resolvedMovieCount: expectedIds.filter((id) => byId.has(id)).length,
                    invalid: validations
                        .filter((validation) => !validation.valid)
                        .map(({ movieId, reasons }) => ({ movieId, reasons })),
                },
            },
        );
    }
    return true;
};

const normalizeGenres = (genres) => (Array.isArray(genres) ? genres : [])
    .slice(0, 3)
    .map((genre) => (typeof genre === 'string' ? { id: genre, name: genre } : genre))
    .filter((genre) => genre?.name);

export const normalizeHeroMovie = (movie, { posterOnly = false } = {}) => {
    if (!movie) return null;
    const id = String(movie._id || movie.id || '');
    if (!id) return null;
    const videoEnabled = !posterOnly && movie.heroVideoStatus === 'ready';
    const videoUrl = videoEnabled ? String(movie.heroVideoUrl || '') : '';
    const mimeType = videoEnabled ? String(movie.heroVideoMimeType || '') : '';
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
        heroVideoUrl: videoUrl,
        heroVideoMimeType: mimeType,
        heroVideoPosterUrl: movie.heroVideoPosterUrl || movie.backdrop_path || movie.poster_path || '',
        heroVideoStatus: videoEnabled ? 'ready' : 'poster-only',
        heroVideoVersion: videoEnabled ? String(movie.heroVideoVersion || '') : '',
        heroVideoSources: videoUrl ? [{ src: videoUrl, type: mimeType }] : [],
        heroVideoMetadata: videoEnabled ? {
            duration: Number(movie.heroVideoDuration) || null,
            width: Number(movie.heroVideoWidth) || null,
            height: Number(movie.heroVideoHeight) || null,
            bytes: Number(movie.heroVideoBytes) || null,
            codec: movie.heroVideoCodec || '',
        } : null,
        cta: { movieId: id },
    };
};

const loadOrderedMovies = async (movieIds, select = MOVIE_PUBLIC_SELECT) => {
    const ids = normalizeIds(movieIds);
    if (!ids.length) return [];
    const movies = await Movie.find({ _id: { $in: ids } }).select(select).lean();
    const byId = new Map(movies.map((movie) => [String(movie._id), movie]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
};

const getHeroSettings = async () => {
    let config = await SiteConfig.findOne({ key: 'homeHero' })
        .select('homeHero updatedAt key')
        .lean();
    // Keep the read path side-effect free once the settings document exists.
    // The upsert is only a one-time initialization for a missing legacy document.
    if (!config || (!config.homeHero && !config.key)) {
        config = await SiteConfig.findOneAndUpdate(
            { key: 'homeHero' },
            {
                $setOnInsert: {
                    key: 'homeHero',
                    'homeHero.mode': 'auto',
                    'homeHero.movieIds': [],
                    'homeHero.heroSoundDefaultEnabled': false,
                    'homeHero.heroDefaultVolume': HERO_DEFAULT_VOLUME,
                },
            },
            { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
        ).lean();
    }
    const volume = Number(config?.homeHero?.heroDefaultVolume);
    return {
        mode: config?.homeHero?.mode === 'manual' ? 'manual' : 'auto',
        movieIds: normalizeIds(config?.homeHero?.movieIds).slice(0, HERO_ACTIVE_SIZE),
        heroSoundDefaultEnabled: Boolean(config?.homeHero?.heroSoundDefaultEnabled),
        heroDefaultVolume: Number.isFinite(volume)
            ? Math.min(Math.max(volume, 0), 1)
            : HERO_DEFAULT_VOLUME,
        updatedAt: config?.updatedAt || null,
    };
};

const toPublicPayload = async (batch, { cache = 'miss' } = {}) => {
    const settings = await getHeroSettings();
    const rawMovies = await loadOrderedMovies(batch.activeHeroMovieIds);
    const validations = rawMovies.map((movie) => validateNativeHeroMovie(movie));
    const urls = rawMovies.map((movie) => String(movie.heroVideoUrl || ''));
    if (
        rawMovies.length !== HERO_ACTIVE_SIZE
        || validations.some((result) => !result.valid)
        || new Set(urls).size !== HERO_ACTIVE_SIZE
    ) {
        throw new HeroRotationError(
            'HERO_ACTIVE_ASSETS_INVALID',
            'The active Hero batch does not resolve to five unique verified native trailers.',
            {
                details: validations.map((result) => ({
                    movieId: result.movieId,
                    reasons: result.reasons,
                })),
            },
        );
    }
    const dateKey = getHeroLocalDateKey(
        batch.generatedAt || batch.createdAt || new Date(),
    );
    return {
        version: batch.version,
        batchId: String(batch._id),
        batchKey: batch.batchKey,
        generatedAt: batch.generatedAt || batch.createdAt,
        nextRefreshAt: batch.nextRefreshAt,
        timezone: batch.timezone || HERO_REFRESH_TIMEZONE,
        dateKey,
        dailyEntropy: batch.dailyEntropy || String(batch._id),
        settings: {
            mode: settings.mode,
            configuredMode: settings.mode,
            effectiveMode: 'auto',
            heroSoundDefaultEnabled: settings.heroSoundDefaultEnabled,
            heroDefaultVolume: settings.heroDefaultVolume,
            updatedAt: settings.updatedAt,
        },
        movies: rawMovies.map((movie) => normalizeHeroMovie(movie)),
        rotation: {
            key: batch.batchKey,
            startsAt: batch.activatedAt || batch.generatedAt,
            endsAt: batch.nextRefreshAt,
            batchSize: HERO_ACTIVE_SIZE,
            poolSize: HERO_POOL_SIZE,
        },
        meta: {
            configuredMode: settings.mode,
            effectiveMode: 'auto',
            source: 'auto-rotation',
            version: batch.version,
            buildSha: String(process.env.BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'dev-local'),
            deploymentId: String(process.env.VERCEL_DEPLOYMENT_ID || 'local-dev'),
            environment: process.env.NODE_ENV || 'development',
        },
        cache,
    };
};

const loadManualPayload = async (settings, now = new Date()) => {
    const rawMovies = await loadOrderedMovies(settings.movieIds);
    const window = getHeroRefreshWindow(now);
    const dateKey = getHeroLocalDateKey(now);
    return {
        version: 1,
        batchId: 'manual',
        batchKey: `manual-${dateKey}`,
        generatedAt: settings.updatedAt || now,
        nextRefreshAt: window.nextRefreshAt,
        timezone: window.timezone,
        dateKey,
        dailyEntropy: 'manual',
        settings: {
            mode: 'manual',
            configuredMode: 'manual',
            effectiveMode: 'manual',
            heroSoundDefaultEnabled: settings.heroSoundDefaultEnabled,
            heroDefaultVolume: settings.heroDefaultVolume,
            updatedAt: settings.updatedAt,
        },
        movies: rawMovies.map((movie) => normalizeHeroMovie(movie)),
        rotation: {
            key: `manual-${dateKey}`,
            startsAt: window.startsAt,
            endsAt: window.nextRefreshAt,
            batchSize: rawMovies.length,
            poolSize: rawMovies.length,
        },
        meta: {
            configuredMode: 'manual',
            effectiveMode: 'manual',
            source: 'manual-selection',
            version: 1,
            buildSha: String(process.env.BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'dev-local'),
            deploymentId: String(process.env.VERCEL_DEPLOYMENT_ID || 'local-dev'),
            environment: process.env.NODE_ENV || 'development',
        },
        cache: 'manual',
    };
};

const loadPosterOnlyFallback = async (now = new Date()) => {
    const settings = await getHeroSettings();
    const selectedIds = settings.movieIds;
    let movies = await loadOrderedMovies(selectedIds);
    if (movies.length < HERO_ACTIVE_SIZE) {
        const used = new Set(movies.map((movie) => String(movie._id)));
        const extras = await Movie.find({
            _id: { $nin: [...used] },
            poster_path: { $nin: ['', null] },
            backdrop_path: { $nin: ['', null] },
        })
            .select(MOVIE_PUBLIC_SELECT)
            .sort({ release_date: -1, vote_average: -1, _id: 1 })
            .limit(HERO_ACTIVE_SIZE - movies.length)
            .lean();
        movies = [...movies, ...extras];
    }
    const window = getHeroRefreshWindow(now);
    const dateKey = getHeroLocalDateKey(now);
    return {
        version: 0,
        batchId: null,
        batchKey: window.key,
        generatedAt: null,
        nextRefreshAt: window.nextRefreshAt,
        timezone: window.timezone,
        dateKey,
        dailyEntropy: randomUUID(),
        settings: {
            mode: settings.mode,
            configuredMode: settings.mode,
            effectiveMode: 'poster-only',
            heroSoundDefaultEnabled: settings.heroSoundDefaultEnabled,
            heroDefaultVolume: settings.heroDefaultVolume,
            updatedAt: settings.updatedAt,
        },
        movies: movies.slice(0, HERO_ACTIVE_SIZE).map((movie) => normalizeHeroMovie(movie, { posterOnly: true })),
        rotation: {
            key: window.key,
            startsAt: window.startsAt,
            endsAt: window.nextRefreshAt,
            batchSize: HERO_ACTIVE_SIZE,
            poolSize: 0,
        },
        meta: {
            configuredMode: settings.mode,
            effectiveMode: 'poster-only',
            source: 'poster-fallback',
            version: 0,
            buildSha: String(process.env.BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'dev-local'),
            deploymentId: String(process.env.VERCEL_DEPLOYMENT_ID || 'local-dev'),
            environment: process.env.NODE_ENV || 'development',
        },
        cache: 'fallback',
    };
};

export const getPublicHeroRotation = async ({ now = new Date() } = {}) => {
    const settings = await getHeroSettings();
    if (settings.mode === 'manual') {
        return loadManualPayload(settings, now);
    }
    const config = await SiteConfig.findOne({ key: 'heroRotation' })
        .select('heroRotation')
        .lean();
    let batch = config?.heroRotation?.activeBatchId
        ? await HeroRotationBatch.findById(config.heroRotation.activeBatchId).lean()
        : null;
    if (!batch || batch.status !== 'active') {
        batch = await HeroRotationBatch.findOne({ status: 'active' }).lean();
    }
    if (!batch) {
        const lastGood = await heroRotationRuntime.getJson(redisKeys.heroLastGood());
        return lastGood ? { ...lastGood, cache: 'last-good' } : loadPosterOnlyFallback(now);
    }
    const cacheGeneration = Math.max(
        0,
        Number(config?.heroRotation?.cacheGeneration || 0),
    );
    const cacheKey = redisKeys.heroActive(batch._id, batch.version, cacheGeneration);
    const cached = await heroRotationRuntime.getJson(cacheKey);
    if (cached) return { ...cached, cache: 'hit' };
    try {
        const payload = await toPublicPayload(batch);
        await heroRotationRuntime.setJson(cacheKey, payload, redisTtl.heroActive);
        await heroRotationRuntime.setJson(redisKeys.heroLastGood(), payload, redisTtl.heroLastGood);
        return payload;
    } catch (error) {
        const lastGood = await heroRotationRuntime.getJson(redisKeys.heroLastGood());
        if (lastGood) return { ...lastGood, cache: 'last-good' };
        return loadPosterOnlyFallback(now);
    }
};

export const createHeroEtag = (payload) => {
    const identity = JSON.stringify({
        batchId: payload?.batchId || 'poster',
        version: payload?.version ?? 0,
        dateKey: payload?.dateKey || '',
        dailyEntropy: payload?.dailyEntropy || '',
        movies: (payload?.movies || []).map((movie) => ({
            id: movie.id || movie._id,
            videoVersion: movie.heroVideoVersion || '',
        })),
        sound: payload?.settings?.heroSoundDefaultEnabled,
        volume: payload?.settings?.heroDefaultVolume,
        settingsUpdatedAt: payload?.settings?.updatedAt || null,
        generatedAt: payload?.generatedAt || null,
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
    const candidates = String(ifNoneMatch || '')
        .split(',')
        .map(normalize);
    return candidates.includes('*')
        || candidates.includes(normalize(etag));
};

const compareNewest = (left, right) => (
    String(right.release_date || '').localeCompare(String(left.release_date || ''))
    || Number(right.popularity || 0) - Number(left.popularity || 0)
    || String(left._id).localeCompare(String(right._id))
);

const compareHot = (left, right) => (
    Number(right.popularity || 0) - Number(left.popularity || 0)
    || Number(right.vote_count || 0) - Number(left.vote_count || 0)
    || Number(right.vote_average || 0) - Number(left.vote_average || 0)
    || String(left._id).localeCompare(String(right._id))
);

const preferOutsidePrevious = (movies, previousPool) => [
    ...movies.filter((movie) => !previousPool.has(String(movie._id))),
    ...movies.filter((movie) => previousPool.has(String(movie._id))),
];

const isEligibleHeroCandidate = (movie) => (
    movie?.adult !== true
    && Boolean(String(movie?.title || '').trim())
    && Boolean(movie?.poster_path)
    && Boolean(movie?.backdrop_path)
    && /^\d{4}-\d{2}-\d{2}$/.test(String(movie?.release_date || ''))
    && !Number.isNaN(Date.parse(`${movie.release_date}T00:00:00Z`))
);

export const buildHeroPoolFromCatalog = async ({
    catalogBatch,
    selectionSeed,
    previousBatch,
    requireNative = true,
}) => {
    if (!catalogBatch || catalogBatch.status !== 'active' || !Array.isArray(catalogBatch.movieIds)) {
        throw new HeroRotationError('CATALOG_UNAVAILABLE', 'An active 150-movie catalog is required.', {
            status: 503,
            transient: true,
        });
    }
    const candidates = await Movie.find({ _id: { $in: catalogBatch.movieIds } })
        .select(MOVIE_PUBLIC_SELECT)
        .lean();
    const previousPool = new Set(normalizeIds(previousBatch?.movieIds));
    const byId = new Map(candidates.map((movie) => [String(movie._id), movie]));
    const eligibleCandidates = candidates.filter(isEligibleHeroCandidate);
    const nativeCandidates = eligibleCandidates.filter((movie) => (
        validateNativeHeroMovie(movie).valid
    ));
    const validById = new Map(nativeCandidates.map((movie) => [String(movie._id), movie]));
    const nativeUrls = new Map();
    const duplicateUrlMovieIds = new Set();
    if (requireNative) {
        for (const movie of nativeCandidates) {
            const url = String(movie.heroVideoUrl);
            if (nativeUrls.has(url)) {
                duplicateUrlMovieIds.add(String(movie._id));
                duplicateUrlMovieIds.add(nativeUrls.get(url));
            } else {
                nativeUrls.set(url, String(movie._id));
            }
        }
    }
    const usable = (requireNative ? nativeCandidates : eligibleCandidates)
        .filter((movie) => !duplicateUrlMovieIds.has(String(movie._id)));
    const usableById = new Map(usable.map((movie) => [String(movie._id), movie]));
    const newestRanked = normalizeIds(catalogBatch.buckets?.newest)
        .map((id) => usableById.get(id))
        .filter(Boolean)
        .sort(compareNewest);
    const newestMovies = preferOutsidePrevious(newestRanked, previousPool).slice(0, HERO_POOL_GROUP_SIZE);
    const selected = new Set(newestMovies.map((movie) => String(movie._id)));
    const hotRanked = usable
        .filter((movie) => (
            !selected.has(String(movie._id))
            && Number(movie.vote_count || 0) >= HERO_MIN_VOTE_COUNT
        ))
        .sort(compareHot);
    const hotMovies = preferOutsidePrevious(hotRanked, previousPool).slice(0, HERO_POOL_GROUP_SIZE);
    hotMovies.forEach((movie) => selected.add(String(movie._id)));
    const discoveryCandidates = usable
        .filter((movie) => (
            !selected.has(String(movie._id))
            && movie.adult !== true
            && Number(movie.vote_average || 0) >= HERO_MIN_VOTE_AVERAGE
            && Number(movie.vote_count || 0) >= HERO_MIN_VOTE_COUNT
            && movie.poster_path
            && movie.backdrop_path
        ))
        .sort((left, right) => String(left._id).localeCompare(String(right._id)));
    const discoveryIds = getDeterministicPermutation(
        discoveryCandidates.map((movie) => String(movie._id)),
        `${selectionSeed}:discovery-pool`,
    );
    const discoveryPreferred = [
        ...discoveryIds.filter((id) => !previousPool.has(id)),
        ...discoveryIds.filter((id) => previousPool.has(id)),
    ];
    const discoveryMovies = discoveryPreferred
        .slice(0, HERO_POOL_GROUP_SIZE)
        .map((id) => usableById.get(id));
    const groups = {
        newestMovieIds: newestMovies.map((movie) => String(movie._id)),
        hotMovieIds: hotMovies.map((movie) => String(movie._id)),
        discoveryMovieIds: discoveryMovies.map((movie) => String(movie._id)),
    };
    if (Object.values(groups).some((ids) => ids.length !== HERO_POOL_GROUP_SIZE)) {
        const invalid = candidates
            .filter((movie) => !validById.has(String(movie._id)))
            .map((movie) => ({
                movieId: String(movie._id),
                reasons: validateNativeHeroMovie(movie).reasons,
            }));
        throw new HeroRotationError(
            requireNative ? 'HERO_NATIVE_ASSETS_INSUFFICIENT' : 'HERO_POOL_CANDIDATES_INSUFFICIENT',
            requireNative
                ? 'Fifteen unique movie-specific native trailers are required before activating a Hero batch.'
                : 'The active catalog does not contain enough eligible movies to display a pending Hero pool.',
            {
                details: {
                    catalogMovieCount: byId.size,
                    eligibleMovieCount: eligibleCandidates.length,
                    validNativeMovieCount: nativeCandidates.length - duplicateUrlMovieIds.size,
                    duplicateUrlMovieIds: [...duplicateUrlMovieIds],
                    missingOrInvalid: invalid,
                    categoryCounts: Object.fromEntries(
                        Object.entries(groups).map(([key, ids]) => [key, ids.length]),
                    ),
                },
            },
        );
    }
    const movieIds = [
        ...groups.newestMovieIds,
        ...groups.hotMovieIds,
        ...groups.discoveryMovieIds,
    ];
    if (requireNative) {
        assertHeroPoolAssetsReady({
            movies: movieIds.map((id) => usableById.get(id)),
            expectedMovieIds: movieIds,
        });
    }
    return {
        ...groups,
        movieIds,
        activeHeroMovieIds: selectActiveHeroMovieIds({
            ...groups,
            selectionSeed,
            previousHeroMovieIds: previousBatch?.activeHeroMovieIds || [],
        }),
        sourceMetadata: {
            catalogBatchId: String(catalogBatch._id),
            catalogVersion: catalogBatch.version,
            catalogWeekKey: catalogBatch.weekKey,
            candidateCount: candidates.length,
            eligibleMovieCount: eligibleCandidates.length,
            validNativeMovieCount: nativeCandidates.filter(
                (movie) => !duplicateUrlMovieIds.has(String(movie._id)),
            ).length,
            nativeRequired: requireNative,
        },
    };
};

const assertHeroLease = async (lock, lostLease = () => false) => {
    if (lostLease() || !await heroRotationRuntime.verifyFencedLock(lock)) {
        throw new HeroRotationError('HERO_REFRESH_LOCK_LOST', 'The Hero refresh lease was lost.', {
            status: 409,
            transient: true,
        });
    }
};

export const invalidateHeroCaches = async () => {
    await heroRotationRuntime.deleteByPattern(redisKeys.heroActivePattern());
    await heroRotationRuntime.deleteKeys(redisKeys.homeHero());
    await heroRotationRuntime.deleteByPattern(redisKeys.homeHeroPattern());
};

export const bumpHeroCacheGeneration = async () => SiteConfig.updateOne(
    { key: 'heroRotation' },
    {
        $setOnInsert: { key: 'heroRotation' },
        $inc: { 'heroRotation.cacheGeneration': 1 },
    },
    { upsert: true },
);

const repairActiveHeroCaches = async ({
    expectedBatchId,
    expectedVersion,
    expectedMovieIds,
} = {}) => {
    await invalidateHeroCaches();
    const activeBatch = await HeroRotationBatch.findOne({ status: 'active' }).lean();
    if (!activeBatch) {
        throw new HeroRotationError(
            'HERO_CACHE_WARM_FAILED',
            'There is no active Hero batch to warm.',
            { status: 500, transient: true },
        );
    }
    const payload = await heroRotationRuntime.getPublicRotation();
    const activeBatchId = String(activeBatch._id);
    const expectedIds = normalizeIds(expectedMovieIds || activeBatch.activeHeroMovieIds);
    const payloadIds = normalizeIds(payload.movies.map((movie) => movie.id || movie._id));
    if (
        payload.batchId !== activeBatchId
        || payload.version !== activeBatch.version
        || payload.movies.length !== HERO_ACTIVE_SIZE
        || (expectedBatchId && activeBatchId !== String(expectedBatchId))
        || (expectedVersion != null && activeBatch.version !== expectedVersion)
        || payload.cache === 'last-good'
        || payload.cache === 'fallback'
        || expectedIds.length !== HERO_ACTIVE_SIZE
        || expectedIds.some((movieId, index) => movieId !== payloadIds[index])
    ) {
        throw new HeroRotationError(
            'HERO_CACHE_WARM_FAILED',
            'The active Hero batch could not be verified while warming caches.',
            { status: 500, transient: true },
        );
    }
    return { activeBatch, payload };
};

const serializeBatch = (batch, extra = {}) => ({
    batchId: batch?._id ? String(batch._id) : null,
    batchKey: batch?.batchKey || null,
    version: batch?.version ?? null,
    status: batch?.status || null,
    generatedAt: batch?.generatedAt || null,
    activatedAt: batch?.activatedAt || null,
    nextRefreshAt: batch?.nextRefreshAt || null,
    timezone: batch?.timezone || HERO_REFRESH_TIMEZONE,
    failureReason: batch?.failureReason || '',
    ...extra,
});

export const getHeroRefreshRunIdentity = ({
    source = 'admin',
    requestedBy = 'system',
    now = new Date(),
    runId,
    force = source !== 'cron',
} = {}) => {
    const window = getHeroRefreshWindow(now);
    const forceBucket = Math.floor(now.getTime() / (5 * 60 * 1000));
    const stableRunId = String(runId || (
        force
            ? `${source}:${requestedBy}:${forceBucket}`
            : `${source}:${window.key}`
    ));
    if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(stableRunId)) {
        throw new HeroRotationError(
            'HERO_RUN_ID_INVALID',
            'Hero refresh runId must contain 1-160 safe characters.',
            { status: 400, transient: false },
        );
    }
    const runDigest = createHash('sha256').update(stableRunId).digest('hex').slice(0, 16);
    return {
        window,
        stableRunId,
        batchKey: force ? `manual-${runDigest}` : window.key,
    };
};

export const refreshHeroRotation = async ({
    source = 'admin',
    requestedBy = 'system',
    now = new Date(),
    runId,
    force = source !== 'cron',
} = {}) => {
    const config = await SiteConfig.findOne({ key: 'heroRotation' }).select('heroRotation').lean();
    if (!force && !isHeroRefreshDue({ now, nextRefreshAt: config?.heroRotation?.nextRefreshAt })) {
        return {
            skipped: true,
            reason: 'not-due',
            nextRefreshAt: config.heroRotation.nextRefreshAt,
            timezone: HERO_REFRESH_TIMEZONE,
        };
    }
    const {
        stableRunId,
        batchKey,
    } = getHeroRefreshRunIdentity({
        source,
        requestedBy,
        now,
        runId,
        force,
    });
    const idempotencyKey = redisKeys.heroRefreshIdempotency(batchKey);
    const cachedRun = await heroRotationRuntime.getJson(idempotencyKey);
    if (cachedRun?.status === 'succeeded') {
        return { skipped: true, reason: 'idempotent-cache', ...cachedRun.result };
    }
    const lock = await heroRotationRuntime.acquireFencedLock(
        redisKeys.heroRefreshLock(),
        redisKeys.heroRefreshFence(),
        {
            ttlMs: redisTtl.heroRefreshLockMs,
            waitMs: 10000,
            minimumFencingToken: config?.heroRotation?.lastFencingToken || 0,
        },
    );
    let lost = false;
    const heartbeat = setInterval(async () => {
        try {
            if (!await heroRotationRuntime.renewFencedLock(lock)) lost = true;
        } catch {
            lost = true;
        }
    }, Math.min(30000, Math.floor(redisTtl.heroRefreshLockMs / 4)));
    heartbeat.unref?.();
    let buildingBatch = null;
    try {
        await assertHeroLease(lock, () => lost);
        if (!force) {
            const lockedConfig = await SiteConfig.findOne({ key: 'heroRotation' })
                .select('heroRotation')
                .lean();
            if (!isHeroRefreshDue({ now, nextRefreshAt: lockedConfig?.heroRotation?.nextRefreshAt })) {
                return {
                    skipped: true,
                    reason: 'not-due-after-lock',
                    nextRefreshAt: lockedConfig?.heroRotation?.nextRefreshAt || null,
                    timezone: HERO_REFRESH_TIMEZONE,
                };
            }
        }
        const batchIdentity = force
            ? { $or: [{ runId: stableRunId }, { batchKey }] }
            : { batchKey };
        const lockedExisting = await HeroRotationBatch.findOne(batchIdentity).lean();
        if (lockedExisting && ['active', 'retired'].includes(lockedExisting.status)) {
            await repairActiveHeroCaches(
                lockedExisting.status === 'active'
                    ? {
                        expectedBatchId: lockedExisting._id,
                        expectedVersion: lockedExisting.version,
                    }
                    : {},
            );
            const result = serializeBatch(lockedExisting);
            await heroRotationRuntime.setRequiredJson(
                idempotencyKey,
                { status: 'succeeded', result },
                redisTtl.heroRefreshRun,
            ).catch(() => undefined);
            return { skipped: true, reason: 'idempotent-after-lock', ...result };
        }
        await SiteConfig.findOneAndUpdate(
            { key: 'heroRotation' },
            {
                $setOnInsert: { key: 'heroRotation' },
                $set: { 'heroRotation.refreshing': true },
            },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
        );
        await heroRotationRuntime.setRequiredJson(
            idempotencyKey,
            { status: 'running', runId: stableRunId, batchKey },
            redisTtl.heroRefreshRun,
        );
        const [activeCatalog, previousBatch, latestBatch] = await Promise.all([
            CatalogBatch.findOne({ status: 'active' }).lean(),
            HeroRotationBatch.findOne({ status: 'active' }).lean(),
            HeroRotationBatch.findOne({}).sort({ version: -1 }).lean(),
        ]);
        const nextVersion = Math.max(
            Number(latestBatch?.version || 0),
            Number(lockedExisting?.version || 0),
        ) + 1;
        buildingBatch = await HeroRotationBatch.findOneAndUpdate(
            lockedExisting?._id ? { _id: lockedExisting._id } : { batchKey },
            {
                $setOnInsert: {
                    batchKey,
                },
                $set: {
                    version: nextVersion,
                    runId: stableRunId,
                    generatedAt: now,
                    timezone: HERO_REFRESH_TIMEZONE,
                    selectionSeed: `${batchKey}:${stableRunId}`,
                    previousBatchId: previousBatch?._id || null,
                    fencingToken: lock.fencingToken,
                    status: 'building',
                    failureReason: '',
                    dailyEntropy: randomUUID(),
                    sourceMetadata: { source, requestedBy },
                },
            },
            {
                returnDocument: 'after',
                upsert: !lockedExisting,
                setDefaultsOnInsert: true,
                runValidators: true,
            },
        );
        const pool = await heroRotationRuntime.buildPool({
            catalogBatch: activeCatalog,
            selectionSeed: buildingBatch.selectionSeed,
            previousBatch,
        });
        const nextRefreshAt = calculateNextHeroRefreshAt(now);
        await assertHeroLease(lock, () => lost);
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await assertHeroLease(lock, () => lost);
                const batch = await HeroRotationBatch.findById(buildingBatch._id).session(session);
                if (!batch || batch.status !== 'building') {
                    throw new HeroRotationError('HERO_BATCH_NOT_BUILDING', 'Only a building Hero batch can be activated.');
                }
                const transactionalMovies = await Movie.find({
                    _id: { $in: pool.movieIds },
                })
                    .select(MOVIE_PUBLIC_SELECT)
                    .session(session)
                    .lean();
                assertHeroPoolAssetsReady({
                    movies: transactionalMovies,
                    expectedMovieIds: pool.movieIds,
                });
                Object.assign(batch, pool);
                batch.nextRefreshAt = nextRefreshAt;
                batch.status = 'active';
                batch.activatedAt = now;
                batch.sourceMetadata = {
                    ...(batch.sourceMetadata || {}),
                    ...pool.sourceMetadata,
                    source,
                    requestedBy,
                };
                await HeroRotationBatch.updateMany(
                    { status: 'active', _id: { $ne: batch._id } },
                    { $set: { status: 'retired', retiredAt: now } },
                    { session },
                );
                await batch.save({ session });
                await SiteConfig.updateOne(
                    { key: 'heroRotation' },
                    { $setOnInsert: { key: 'heroRotation', 'heroRotation.lastFencingToken': 0 } },
                    { upsert: true, session },
                );
                const updated = await SiteConfig.findOneAndUpdate(
                    {
                        key: 'heroRotation',
                        $or: [
                            { 'heroRotation.lastFencingToken': { $lt: lock.fencingToken } },
                            { 'heroRotation.lastFencingToken': { $exists: false } },
                        ],
                    },
                    {
                        $set: {
                            'heroRotation.activeBatchId': batch._id,
                            'heroRotation.lastSuccessfulRefreshAt': now,
                            'heroRotation.nextRefreshAt': nextRefreshAt,
                            'heroRotation.lastFencingToken': lock.fencingToken,
                            'heroRotation.refreshing': false,
                        },
                        $inc: { 'heroRotation.cacheGeneration': 1 },
                    },
                    { returnDocument: 'after', session },
                );
                if (!updated) {
                    throw new HeroRotationError('HERO_STALE_FENCE', 'A newer Hero refresh already completed.', {
                        transient: true,
                    });
                }
                buildingBatch = batch;
            });
        } finally {
            await session.endSession();
        }
        const { payload } = await repairActiveHeroCaches({
            expectedBatchId: buildingBatch._id,
            expectedVersion: buildingBatch.version,
            expectedMovieIds: buildingBatch.activeHeroMovieIds,
        });
        await heroRotationRuntime.setRequiredJson(
            redisKeys.heroRefreshRun(stableRunId),
            { status: 'succeeded', ...serializeBatch(buildingBatch) },
            redisTtl.heroRefreshRun,
        ).catch(() => undefined);
        const result = {
            skipped: false,
            ...serializeBatch(buildingBatch),
            movieCount: payload.movies.length,
        };
        await heroRotationRuntime.setRequiredJson(
            idempotencyKey,
            { status: 'succeeded', result },
            redisTtl.heroRefreshRun,
        ).catch(() => undefined);
        return result;
    } catch (error) {
        const normalized = error instanceof HeroRotationError
            ? error
            : new HeroRotationError('HERO_REFRESH_FAILED', 'Hero rotation refresh failed.', {
                status: 500,
                transient: true,
                cause: error,
            });
        if (buildingBatch?._id) {
            await HeroRotationBatch.updateOne(
                { _id: buildingBatch._id, status: 'building' },
                {
                    $set: {
                        status: 'failed',
                        failureReason: normalized.code,
                        sourceMetadata: {
                            ...(buildingBatch.sourceMetadata || {}),
                            failureDetails: normalized.details || null,
                        },
                    },
                },
            ).catch(() => undefined);
        }
        await heroRotationRuntime.setRequiredJson(
            redisKeys.heroRefreshRun(stableRunId),
            { status: 'failed', code: normalized.code, message: normalized.message },
            redisTtl.heroRefreshRun,
        ).catch(() => undefined);
        await heroRotationRuntime.setRequiredJson(
            idempotencyKey,
            { status: 'failed', code: normalized.code },
            redisTtl.heroRefreshRun,
        ).catch(() => undefined);
        throw normalized;
    } finally {
        clearInterval(heartbeat);
        await SiteConfig.updateOne(
            {
                key: 'heroRotation',
                $or: [
                    { 'heroRotation.lastFencingToken': { $lte: lock.fencingToken } },
                    { 'heroRotation.lastFencingToken': { $exists: false } },
                ],
            },
            { $set: { 'heroRotation.refreshing': false } },
        ).catch(() => undefined);
        await heroRotationRuntime.releaseFencedLock(lock);
    }
};

export const rerandomizeActiveHero = async ({
    requestedBy = 'admin',
    now = new Date(),
    selectionSeed = randomUUID(),
} = {}) => {
    const normalizedSeed = String(selectionSeed || '').trim();
    if (!normalizedSeed || normalizedSeed.length > 160) {
        throw new HeroRotationError('HERO_SELECTION_SEED_INVALID', 'selectionSeed must contain 1-160 characters.', {
            status: 400,
        });
    }
    const config = await SiteConfig.findOne({ key: 'heroRotation' }).select('heroRotation').lean();
    const lock = await heroRotationRuntime.acquireFencedLock(
        redisKeys.heroRefreshLock(),
        redisKeys.heroRefreshFence(),
        {
            ttlMs: redisTtl.heroRefreshLockMs,
            waitMs: 5000,
            minimumFencingToken: config?.heroRotation?.lastFencingToken || 0,
        },
    );
    let updated = null;
    let session = null;
    try {
        await assertHeroLease(lock);
        session = await mongoose.startSession();
        await session.withTransaction(async () => {
            const lockedConfig = await SiteConfig.findOne({ key: 'heroRotation' })
                .select('heroRotation')
                .session(session)
                .lean();
            const batch = lockedConfig?.heroRotation?.activeBatchId
                ? await HeroRotationBatch.findById(lockedConfig.heroRotation.activeBatchId).session(session).lean()
                : await HeroRotationBatch.findOne({ status: 'active' }).session(session).lean();
            if (!batch || batch.status !== 'active') {
                throw new HeroRotationError('HERO_ACTIVE_BATCH_MISSING', 'There is no active Hero pool to randomize.', {
                    status: 404,
                });
            }
            const nextIds = selectActiveHeroMovieIds({
                newestMovieIds: batch.newestMovieIds,
                hotMovieIds: batch.hotMovieIds,
                discoveryMovieIds: batch.discoveryMovieIds,
                selectionSeed: normalizedSeed,
                previousHeroMovieIds: batch.activeHeroMovieIds,
            });
            const previousIds = normalizeIds(batch.activeHeroMovieIds);
            const selectedMovies = await Movie.find({ _id: { $in: nextIds } })
                .select(MOVIE_PUBLIC_SELECT)
                .session(session)
                .lean();
            assertHeroActiveAssetsReady({ movies: selectedMovies, expectedMovieIds: nextIds });
            updated = await HeroRotationBatch.findOneAndUpdate(
                {
                    _id: batch._id,
                    status: 'active',
                    activeHeroMovieIds: previousIds,
                },
                {
                    $set: {
                        activeHeroMovieIds: nextIds,
                        selectionSeed: normalizedSeed,
                        sourceMetadata: {
                            ...(batch.sourceMetadata || {}),
                            rerandomizedAt: now,
                            rerandomizedBy: requestedBy,
                            previousHeroMovieIds: previousIds,
                        },
                    },
                },
                { returnDocument: 'after', runValidators: true, session },
            );
            if (!updated) {
                throw new HeroRotationError(
                    'HERO_RERANDOMIZE_CONFLICT',
                    'The active Hero selection changed concurrently; retry with a new request.',
                    { status: 409, transient: true },
                );
            }
            await assertHeroLease(lock);
            const generation = await SiteConfig.findOneAndUpdate(
                { key: 'heroRotation' },
                {
                    $setOnInsert: { key: 'heroRotation' },
                    $inc: { 'heroRotation.cacheGeneration': 1 },
                },
                { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true, session },
            );
            if (!generation) {
                throw new HeroRotationError('HERO_CACHE_GENERATION_FAILED', 'Hero cache generation could not be advanced.', {
                    status: 500,
                    transient: true,
                });
            }
        });
        const { payload } = await repairActiveHeroCaches({
            expectedBatchId: updated._id,
            expectedVersion: updated.version,
            expectedMovieIds: updated.activeHeroMovieIds,
        });
        return { batch: serializeBatch(updated), payload };
    } finally {
        await session?.endSession();
        await heroRotationRuntime.releaseFencedLock(lock);
    }
};

export const updateHeroSoundSettings = async ({
    heroSoundDefaultEnabled,
    heroDefaultVolume,
}) => {
    if (typeof heroSoundDefaultEnabled !== 'boolean') {
        throw new HeroRotationError('HERO_SOUND_INVALID', 'heroSoundDefaultEnabled must be a boolean.', {
            status: 400,
        });
    }
    const volume = Number(heroDefaultVolume);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
        throw new HeroRotationError('HERO_VOLUME_INVALID', 'heroDefaultVolume must be between 0 and 1.', {
            status: 400,
        });
    }
    // Advance the public generation first so a later settings write cannot be
    // hidden behind an already-warmed payload if the process crashes mid-update.
    await bumpHeroCacheGeneration();
    const config = await SiteConfig.findOneAndUpdate(
        { key: 'homeHero' },
        {
            $setOnInsert: { key: 'homeHero' },
            $set: {
                'homeHero.heroSoundDefaultEnabled': heroSoundDefaultEnabled,
                'homeHero.heroDefaultVolume': volume,
            },
        },
        { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
    ).lean();
    const activeBatch = await HeroRotationBatch.findOne({ status: 'active' }).lean();
    if (activeBatch) {
        await repairActiveHeroCaches({
            expectedBatchId: activeBatch._id,
            expectedVersion: activeBatch.version,
        });
    } else {
        await invalidateHeroCaches();
        await heroRotationRuntime.getPublicRotation();
    }
    return {
        heroSoundDefaultEnabled: Boolean(config.homeHero.heroSoundDefaultEnabled),
        heroDefaultVolume: Number(config.homeHero.heroDefaultVolume),
        updatedAt: config.updatedAt,
    };
};

export const getAdminHeroRotation = async () => {
    const [settings, activeBatch, recentBatches, config] = await Promise.all([
        getHeroSettings(),
        HeroRotationBatch.findOne({ status: 'active' }).lean(),
        HeroRotationBatch.find({}).sort({ createdAt: -1 }).limit(10).lean(),
        SiteConfig.findOne({ key: 'heroRotation' }).select('heroRotation').lean(),
    ]);
    const heroRotation = config?.heroRotation || {};
    const refreshState = {
        lastSuccessfulRefreshAt: heroRotation.lastSuccessfulRefreshAt || null,
        nextRefreshAt: heroRotation.nextRefreshAt || activeBatch?.nextRefreshAt || null,
        refreshing: Boolean(heroRotation.refreshing),
        cacheGeneration: Number(heroRotation.cacheGeneration || 0),
        lastFencingToken: Number(heroRotation.lastFencingToken || 0),
    };
    if (!activeBatch) {
        const catalog = await CatalogBatch.findOne({ status: 'active' })
            .select('_id status version weekKey movieIds buckets')
            .lean();
        const catalogMovies = catalog?.movieIds?.length
            ? await Movie.find({ _id: { $in: catalog.movieIds } })
                .select(MOVIE_PUBLIC_SELECT)
                .lean()
            : [];
        let pendingPool = null;
        if (catalog?.movieIds?.length) {
            try {
                pendingPool = await buildHeroPoolFromCatalog({
                    catalogBatch: catalog,
                    selectionSeed: `pending:${catalog.version}:${catalog.weekKey}`,
                    previousBatch: null,
                    requireNative: false,
                });
            } catch {
                pendingPool = null;
            }
        }
        const pendingIds = pendingPool?.movieIds?.length === HERO_POOL_SIZE
            ? pendingPool.movieIds
            : (catalog?.movieIds || []).slice(0, HERO_POOL_SIZE);
        const candidateMovies = pendingIds.length
            ? await loadOrderedMovies(pendingIds)
            : catalogMovies;
        const pendingCategories = new Map([
            ...normalizeIds(pendingPool?.newestMovieIds).map((id) => [id, 'newest']),
            ...normalizeIds(pendingPool?.hotMovieIds).map((id) => [id, 'hot']),
            ...normalizeIds(pendingPool?.discoveryMovieIds).map((id) => [id, 'discovery']),
        ]);
        const candidateState = candidateMovies.map((movie) => {
            const validation = validateNativeHeroMovie(movie);
            return {
                ...normalizeHeroMovie(movie, { posterOnly: !validation.valid }),
                category: pendingCategories.get(String(movie._id)) || null,
                active: false,
                nativeVideoValid: validation.valid,
                nativeVideoIssues: validation.reasons,
            };
        });
        const latestFailed = recentBatches.find((batch) => batch.status === 'failed');
        return {
            settings,
            refreshState,
            activeBatch: null,
            pool: candidateState,
            pendingPool: pendingPool ? {
                ...pendingPool,
                activeHeroMovieIds: [],
            } : null,
            activeMovies: [],
            missingTrailers: candidateState.filter((movie) => !movie.nativeVideoValid),
            candidateCatalog: catalog ? {
                batchId: String(catalog._id),
                version: catalog.version,
                weekKey: catalog.weekKey,
                movieCount: catalog.movieIds.length,
            } : null,
            latestFailure: latestFailed ? {
                ...serializeBatch(latestFailed),
                sourceMetadata: latestFailed.sourceMetadata || {},
            } : null,
            recentBatches: recentBatches.map((batch) => serializeBatch(batch)),
        };
    }
    const movies = await loadOrderedMovies(activeBatch.movieIds);
    const activeSet = new Set(normalizeIds(activeBatch.activeHeroMovieIds));
    const categories = new Map([
        ...normalizeIds(activeBatch.newestMovieIds).map((id) => [id, 'newest']),
        ...normalizeIds(activeBatch.hotMovieIds).map((id) => [id, 'hot']),
        ...normalizeIds(activeBatch.discoveryMovieIds).map((id) => [id, 'discovery']),
    ]);
    const pool = movies.map((movie) => {
        const validation = validateNativeHeroMovie(movie);
        return {
            ...normalizeHeroMovie(movie, { posterOnly: !validation.valid }),
            category: categories.get(String(movie._id)),
            active: activeSet.has(String(movie._id)),
            nativeVideoValid: validation.valid,
            nativeVideoIssues: validation.reasons,
        };
    });
    const poolById = new Map(pool.map((movie) => [String(movie.id || movie._id), movie]));
    return {
        settings,
        refreshState,
        activeBatch: {
            ...serializeBatch(activeBatch),
            selectionSeed: activeBatch.selectionSeed,
            movieCount: activeBatch.movieIds.length,
            activeMovieCount: activeBatch.activeHeroMovieIds.length,
            sourceMetadata: activeBatch.sourceMetadata || {},
        },
        pool,
        activeMovies: normalizeIds(activeBatch.activeHeroMovieIds)
            .map((id) => poolById.get(id))
            .filter(Boolean),
        missingTrailers: pool.filter((movie) => !movie.nativeVideoValid),
        recentBatches: recentBatches.map((batch) => serializeBatch(batch)),
    };
};

export default {
    getPublicHeroRotation,
    refreshHeroRotation,
    rerandomizeActiveHero,
    updateHeroSoundSettings,
    getAdminHeroRotation,
};
