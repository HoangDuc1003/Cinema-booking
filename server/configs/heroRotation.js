export class HeroConfigError extends Error {
    constructor(variable, message) {
        super(`${variable}: ${message}`);
        this.name = 'HeroConfigError';
        this.code = 'HERO_CONFIG_INVALID';
        this.variable = variable;
    }
}

const readNumber = (env, name, fallback, {
    integer = false,
    min = Number.NEGATIVE_INFINITY,
    max = Number.POSITIVE_INFINITY,
} = {}) => {
    const raw = String(env?.[name] ?? '').trim();
    const value = raw === '' ? fallback : Number(raw);
    if (
        !Number.isFinite(value)
        || (integer && !Number.isInteger(value))
        || value < min
        || value > max
    ) {
        throw new HeroConfigError(
            name,
            `must be ${integer ? 'an integer' : 'a finite number'} between ${min} and ${max}`,
        );
    }
    return value;
};

const readBoolean = (env, name, fallback) => {
    const raw = String(env?.[name] ?? '').trim().toLowerCase();
    if (!raw) return fallback;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    throw new HeroConfigError(name, 'must be true or false');
};

const readTimezone = (env) => {
    const timezone = String(env?.HERO_REFRESH_TIMEZONE || 'Asia/Ho_Chi_Minh').trim();
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    } catch {
        throw new HeroConfigError('HERO_REFRESH_TIMEZONE', 'must be a valid IANA timezone');
    }
    if (timezone !== 'Asia/Ho_Chi_Minh') {
        throw new HeroConfigError(
            'HERO_REFRESH_TIMEZONE',
            'must remain Asia/Ho_Chi_Minh for the cinema refresh contract',
        );
    }
    return timezone;
};

const readAllowedHosts = (env) => {
    const hosts = String(env?.HERO_VIDEO_ALLOWED_HOSTS || 'res.cloudinary.com')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean);
    if (!hosts.length || hosts.some((host) => (
        host.length > 253
        || host.includes('://')
        || host.includes('/')
        || host.includes(':')
        || !/^[a-z0-9.-]+$/.test(host)
        || host.startsWith('.')
        || host.endsWith('.')
        || host.includes('..')
    ))) {
        throw new HeroConfigError(
            'HERO_VIDEO_ALLOWED_HOSTS',
            'must be a comma-separated list of hostnames without schemes, ports, paths, or wildcards',
        );
    }
    return [...new Set(hosts)];
};

export const validateHeroRuntimeConfig = (env = process.env) => {
    const refreshIntervalHours = readNumber(
        env,
        'HERO_REFRESH_INTERVAL_HOURS',
        24,
        { integer: true, min: 24, max: 24 },
    );
    const requireNativeVideo = readBoolean(env, 'HERO_REQUIRE_NATIVE_VIDEO', true);
    if (!requireNativeVideo) {
        throw new HeroConfigError(
            'HERO_REQUIRE_NATIVE_VIDEO',
            'must be true; production Hero playback is native-only',
        );
    }
    return Object.freeze({
        refreshTimezone: readTimezone(env),
        refreshIntervalHours,
        defaultVolume: readNumber(
            env,
            'HERO_DEFAULT_VOLUME',
            0.35,
            { min: 0, max: 1 },
        ),
        requireNativeVideo,
        videoAllowedHosts: Object.freeze(readAllowedHosts(env)),
        videoMaxBytes: readNumber(
            env,
            'HERO_VIDEO_MAX_BYTES',
            100 * 1024 * 1024,
            { integer: true, min: 1, max: 2 * 1024 * 1024 * 1024 },
        ),
        videoMaxDurationSeconds: readNumber(
            env,
            'HERO_VIDEO_MAX_DURATION_SECONDS',
            180,
            { min: 1, max: 3600 },
        ),
        videoMinWidth: readNumber(
            env,
            'HERO_VIDEO_MIN_WIDTH',
            640,
            { integer: true, min: 1, max: 16384 },
        ),
        videoMinHeight: readNumber(
            env,
            'HERO_VIDEO_MIN_HEIGHT',
            360,
            { integer: true, min: 1, max: 16384 },
        ),
        videoOrphanGraceSeconds: readNumber(
            env,
            'HERO_VIDEO_ORPHAN_GRACE_SECONDS',
            3600,
            { integer: true, min: 300, max: 604800 },
        ),
        cacheActiveTtlSeconds: readNumber(
            env,
            'CACHE_HERO_ACTIVE_TTL_SECONDS',
            172800,
            { integer: true, min: 300, max: 604800 },
        ),
        cacheLastGoodTtlSeconds: readNumber(
            env,
            'CACHE_HERO_LAST_GOOD_TTL_SECONDS',
            604800,
            { integer: true, min: 3600, max: 2592000 },
        ),
        refreshLockTtlMs: readNumber(
            env,
            'HERO_REFRESH_LOCK_TTL_MS',
            120000,
            { integer: true, min: 30000, max: 900000 },
        ),
        refreshRunTtlSeconds: readNumber(
            env,
            'HERO_REFRESH_RUN_TTL_SECONDS',
            604800,
            { integer: true, min: 3600, max: 2592000 },
        ),
        minVoteAverage: readNumber(
            env,
            'HERO_MIN_VOTE_AVERAGE',
            7,
            { min: 0, max: 10 },
        ),
        minVoteCount: readNumber(
            env,
            'HERO_MIN_VOTE_COUNT',
            300,
            { integer: true, min: 0, max: Number.MAX_SAFE_INTEGER },
        ),
    });
};

export const HERO_RUNTIME_CONFIG = validateHeroRuntimeConfig();
export const HERO_REFRESH_TIMEZONE = HERO_RUNTIME_CONFIG.refreshTimezone;
export const HERO_REFRESH_INTERVAL_HOURS = HERO_RUNTIME_CONFIG.refreshIntervalHours;
export const HERO_DEFAULT_VOLUME = HERO_RUNTIME_CONFIG.defaultVolume;
export const HERO_REQUIRE_NATIVE_VIDEO = HERO_RUNTIME_CONFIG.requireNativeVideo;
export const HERO_VIDEO_ALLOWED_HOSTS = HERO_RUNTIME_CONFIG.videoAllowedHosts;
export const HERO_VIDEO_MAX_BYTES = HERO_RUNTIME_CONFIG.videoMaxBytes;
export const HERO_VIDEO_MAX_DURATION_SECONDS = HERO_RUNTIME_CONFIG.videoMaxDurationSeconds;
export const HERO_VIDEO_MIN_WIDTH = HERO_RUNTIME_CONFIG.videoMinWidth;
export const HERO_VIDEO_MIN_HEIGHT = HERO_RUNTIME_CONFIG.videoMinHeight;
export const HERO_VIDEO_ORPHAN_GRACE_SECONDS = HERO_RUNTIME_CONFIG.videoOrphanGraceSeconds;
export const CACHE_HERO_ACTIVE_TTL_SECONDS = HERO_RUNTIME_CONFIG.cacheActiveTtlSeconds;
export const CACHE_HERO_LAST_GOOD_TTL_SECONDS = HERO_RUNTIME_CONFIG.cacheLastGoodTtlSeconds;
export const HERO_REFRESH_LOCK_TTL_MS = HERO_RUNTIME_CONFIG.refreshLockTtlMs;
export const HERO_REFRESH_RUN_TTL_SECONDS = HERO_RUNTIME_CONFIG.refreshRunTtlSeconds;
export const HERO_MIN_VOTE_AVERAGE = HERO_RUNTIME_CONFIG.minVoteAverage;
export const HERO_MIN_VOTE_COUNT = HERO_RUNTIME_CONFIG.minVoteCount;

export const HERO_VIDEO_CODEC_RULES = Object.freeze({
    'video/mp4': Object.freeze({
        video: Object.freeze(['h264', 'avc1']),
        audio: Object.freeze(['aac', 'mp4a']),
    }),
    'video/webm': Object.freeze({
        video: Object.freeze(['vp8', 'vp9']),
        audio: Object.freeze(['opus', 'vorbis']),
    }),
});

const codecMatches = (value, allowed) => {
    const normalized = String(value || '').trim().toLowerCase();
    return allowed.some((codec) => (
        normalized === codec
        || normalized.startsWith(`${codec}.`)
        || normalized.startsWith(`${codec}-`)
    ));
};

export const isHeroVideoCodecPairSupported = ({
    mimeType,
    videoCodec,
    audioCodec,
}) => {
    const rule = HERO_VIDEO_CODEC_RULES[String(mimeType || '').toLowerCase()];
    return Boolean(
        rule
        && codecMatches(videoCodec, rule.video)
        && codecMatches(audioCodec, rule.audio)
    );
};
