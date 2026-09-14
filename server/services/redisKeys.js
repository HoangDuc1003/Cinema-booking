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
    scheduledShowtimesLock: (movieId) => key('lock', 'scheduled-showtimes', movieId),
    scheduleMovieIds: (dateKey) => key('cache', 'schedule', 'movie-ids', dateKey),
    showtimesPattern: () => key('cache', 'showtimes', '*'),
    bookableNowShowing: (region = 'VN', days = 7) => key('cache', 'shows', 'now-playing', region, days),
    bookableNowShowingPattern: () => key('cache', 'shows', 'now-playing', '*'),
    nowShowingLastGood: () => key('cache', 'shows', 'now-playing', 'last-good'),
    homeTmdbNowPlaying: (region = 'VN') => key('cache', 'home', 'tmdb', 'now-playing-en', region),
    homeTmdbNowPlayingLastGood: (region = 'VN') => key('cache', 'home', 'tmdb', 'now-playing-en', region, 'last-good'),
    tmdbPopular: (page) => key('cache', 'tmdb', 'popular', page),
    tmdbUpcoming: (page) => key('cache', 'tmdb', 'upcoming', page),
    tmdbNowPlaying: (page) => key('cache', 'tmdb', 'now-playing', page),
    tmdbMovie: (movieId) => key('cache', 'tmdb', 'movie', movieId),
    tmdbMovieTitles: (movieId) => key('cache', 'tmdb', 'movie-titles-v1', movieId),
    tmdbSimilar: (movieId, limit) => key('cache', 'tmdb', 'similar', movieId, limit),
    tmdbSimilarPattern: () => key('cache', 'tmdb', 'similar', '*'),
    tmdbVideos: (movieId) => key('cache', 'tmdb', 'videos-v2', movieId),
    tmdbSelectedTrailer: (movieId) => key('cache', 'tmdb', 'selected-trailer-v2', movieId),
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
    // Translated titles rarely change.
    movieTitles: parsePositiveInteger(process.env.CACHE_MOVIE_TITLES_TTL_SECONDS, 7 * 86400),
    cinemas: parsePositiveInteger(process.env.CACHE_CINEMAS_TTL_SECONDS, 600),
    showtimes: parsePositiveInteger(process.env.CACHE_SHOWTIMES_TTL_SECONDS, 120),
    nowShowingLastGood: parsePositiveInteger(process.env.CACHE_NOW_SHOWING_LAST_GOOD_TTL_SECONDS, 2592000), // 30 days
    homeNowShowingLastGood: parsePositiveInteger(process.env.CACHE_HOME_NOW_SHOWING_LAST_GOOD_TTL_SECONDS, 86400),
    tmdbTrailer: parsePositiveInteger(process.env.CACHE_TMDB_TRAILER_TTL_SECONDS, 86400),
    tmdbTrailerNegative: parsePositiveInteger(process.env.CACHE_TMDB_TRAILER_NEGATIVE_TTL_SECONDS, 3600),
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
});
