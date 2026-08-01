import {
    CACHE_HERO_ACTIVE_TTL_SECONDS,
    CACHE_HERO_LAST_GOOD_TTL_SECONDS,
    HERO_REFRESH_LOCK_TTL_MS,
    HERO_REFRESH_RUN_TTL_SECONDS,
} from '../configs/heroRotation.js';

const parsePositiveInteger = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const prefix = `${process.env.REDIS_KEY_PREFIX || 'nitrocine'}:v1`;
const key = (...parts) => [prefix, ...parts.map(String)].join(':');

export const redisKeys = {
    prefix,
    homeHero: () => key('cache', 'hero', 'home'),
    homeHeroPattern: () => key('cache', 'hero', 'home', '*'),
    movies: () => key('cache', 'movies', 'all'),
    nowPlayingMovies: () => key('cache', 'movies', 'now-playing'),
    movie: (movieId) => key('cache', 'movie', movieId),
    cinemas: () => key('cache', 'cinemas', 'all'),
    showtimes: (movieId) => key('cache', 'showtimes', movieId),
    showtimesPattern: () => key('cache', 'showtimes', '*'),
    bookableNowShowing: (region = 'VN', days = 7) => key('cache', 'shows', 'now-playing', region, days),
    bookableNowShowingPattern: () => key('cache', 'shows', 'now-playing', '*'),
    tmdbPopular: (page) => key('cache', 'tmdb', 'popular', page),
    tmdbUpcoming: (page) => key('cache', 'tmdb', 'upcoming', page),
    tmdbNowPlaying: (page) => key('cache', 'tmdb', 'now-playing', page),
    tmdbMovie: (movieId) => key('cache', 'tmdb', 'movie', movieId),
    tmdbSimilar: (movieId, limit) => key('cache', 'tmdb', 'similar', movieId, limit),
    tmdbSimilarPattern: () => key('cache', 'tmdb', 'similar', '*'),
    tmdbVideos: (movieId) => key('cache', 'tmdb', 'videos-v2', movieId),
    tmdbTrailers: (batchId, slot, limit) => key('cache', 'tmdb', 'trailers', batchId, slot, limit),
    tmdbTrailersPattern: () => key('cache', 'tmdb', 'trailers', '*'),
    catalogSlot: (batchId, slot) => key('catalog', 'slot', batchId, slot),
    catalogSlotPattern: () => key('catalog', 'slot', '*'),
    catalogLastGood: () => key('catalog', 'last-good'),
    catalogRefreshLock: () => key('lock', 'catalog-refresh'),
    catalogRefreshFence: () => key('lock', 'catalog-refresh', 'fence'),
    catalogRefreshState: () => key('catalog', 'refresh-state'),
    nowPlayingSyncLock: () => key('lock', 'now-playing-sync'),
    catalogRefreshJob: (runId) => key('catalog', 'refresh-job', runId),
    heroActive: (batchId, version, generation = 0) => key('hero', 'active', batchId, version, generation),
    heroActivePattern: () => key('hero', 'active', '*'),
    heroLastGood: () => key('hero', 'last-good'),
    heroRefreshLock: () => key('lock', 'hero-refresh'),
    heroRefreshFence: () => key('lock', 'hero-refresh', 'fence'),
    heroRefreshRun: (runId) => key('hero', 'refresh-run', runId),
    heroRefreshIdempotency: (windowKey) => key('idempotency', 'hero-refresh', windowKey),
    tmdbSearch: (query, page) => key('cache', 'tmdb', 'search', encodeURIComponent(query.toLowerCase()).slice(0, 120), page),
    seatMap: (showId) => key('cache', 'seat-map', showId),
    seatHold: (showId, seat) => key('hold', 'show', showId, 'seat', seat),
    bookingLock: (showId) => key('lock', 'booking', showId),
    paymentEvent: (eventId) => key('idempotency', 'stripe', eventId),
    paymentEventLock: (eventId) => key('lock', 'stripe-event', eventId),
};

export const redisTtl = Object.freeze({
    movies: parsePositiveInteger(process.env.CACHE_MOVIES_TTL_SECONDS, 300),
    movie: parsePositiveInteger(process.env.CACHE_MOVIE_TTL_SECONDS, 1800),
    cinemas: parsePositiveInteger(process.env.CACHE_CINEMAS_TTL_SECONDS, 600),
    showtimes: parsePositiveInteger(process.env.CACHE_SHOWTIMES_TTL_SECONDS, 120),
    seatMap: parsePositiveInteger(process.env.CACHE_SEAT_MAP_TTL_SECONDS, 5),
    // Stripe Checkout requires expires_at to be at least 30 minutes in the future.
    // Keep a one-minute network/clock buffer and use the same TTL for DB + Redis holds.
    seatHold: Math.min(Math.max(parsePositiveInteger(process.env.SEAT_HOLD_TTL_SECONDS, 1860), 1860), 86400),
    bookingLockMs: parsePositiveInteger(process.env.BOOKING_LOCK_TTL_MS, 10000),
    paymentLockMs: parsePositiveInteger(process.env.PAYMENT_LOCK_TTL_MS, 30000),
    paymentIdempotency: parsePositiveInteger(process.env.PAYMENT_IDEMPOTENCY_TTL_SECONDS, 604800),
    catalogRefreshLockMs: parsePositiveInteger(process.env.CATALOG_REFRESH_LOCK_TTL_MS, 120000),
    nowPlayingSyncLockMs: parsePositiveInteger(process.env.NOW_PLAYING_SYNC_LOCK_TTL_MS, 300000),
    catalogRefreshJob: parsePositiveInteger(process.env.CATALOG_REFRESH_JOB_TTL_SECONDS, 86400),
    heroActive: CACHE_HERO_ACTIVE_TTL_SECONDS,
    heroLastGood: CACHE_HERO_LAST_GOOD_TTL_SECONDS,
    heroRefreshLockMs: HERO_REFRESH_LOCK_TTL_MS,
    heroRefreshRun: HERO_REFRESH_RUN_TTL_SECONDS,
});
