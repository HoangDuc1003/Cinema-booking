const parsePositiveInteger = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const prefix = `${process.env.REDIS_KEY_PREFIX || 'nitrocine'}:v1`;
const key = (...parts) => [prefix, ...parts.map(String)].join(':');

export const redisKeys = {
    prefix,
    movies: () => key('cache', 'movies', 'all'),
    nowPlayingMovies: () => key('cache', 'movies', 'now-playing'),
    movie: (movieId) => key('cache', 'movie', movieId),
    cinemas: () => key('cache', 'cinemas', 'all'),
    showtimes: (movieId) => key('cache', 'showtimes', movieId),
    showtimesPattern: () => key('cache', 'showtimes', '*'),
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
    seatHold: Math.min(Math.max(parsePositiveInteger(process.env.SEAT_HOLD_TTL_SECONDS, 1800), 1800), 86400),
    bookingLockMs: parsePositiveInteger(process.env.BOOKING_LOCK_TTL_MS, 10000),
    paymentLockMs: parsePositiveInteger(process.env.PAYMENT_LOCK_TTL_MS, 30000),
    paymentIdempotency: parsePositiveInteger(process.env.PAYMENT_IDEMPOTENCY_TTL_SECONDS, 604800),
});
