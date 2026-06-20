import { deleteByPattern, deleteKeys } from './cacheService.js';
import { redisKeys } from './redisKeys.js';

export const invalidateMovieCatalog = async (movieId = null) => {
    const keys = [redisKeys.movies(), redisKeys.nowPlayingMovies(), redisKeys.cinemas()];
    if (movieId) keys.push(redisKeys.movie(movieId), redisKeys.showtimes(movieId));
    await deleteKeys(keys);
    if (!movieId) await deleteByPattern(redisKeys.showtimesPattern());
};

export const invalidateSeatAvailability = async ({ showId, movieId, aliases = [] }) => {
    await deleteKeys(
        redisKeys.seatMap(showId),
        aliases.map((alias) => redisKeys.seatMap(alias)),
        movieId ? redisKeys.showtimes(movieId) : null,
    );
};
