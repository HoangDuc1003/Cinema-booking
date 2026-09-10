import Movie from "../models/Movie.js";
import { fetchTmdbJson } from "./tmdbService.js";
import { invalidateMovieCatalog } from "./cacheInvalidationService.js";

const TRENDING_IMPORT_LIMIT = 10;

const toMovieDocument = (movieId, details, credits) => ({
    _id: movieId,
    title: details.title,
    overview: details.overview,
    poster_path: details.poster_path,
    backdrop_path: details.backdrop_path,
    genres: details.genres,
    casts: credits.cast,
    release_date: details.release_date,
    vote_average: details.vote_average,
    runtime: details.runtime,
    tagline: details.tagline || "",
    original_language: details.original_language,
});

/**
 * Imports the TMDB daily trending movies that are not stored yet.
 * Uses fetchTmdbJson so the shared API-key check and request timeout apply;
 * a raw axios call here would hang forever when TMDB stalls.
 */
export const importTrendingMoviesLogic = async () => {
    const trending = await fetchTmdbJson('/trending/movie/day');
    const movieIds = (trending?.results || [])
        .slice(0, TRENDING_IMPORT_LIMIT)
        .map((movie) => String(movie.id))
        .filter(Boolean);
    if (!movieIds.length) return { success: true, count: 0, skipped: 0 };

    const existing = await Movie.find({ _id: { $in: movieIds } }).select('_id').lean();
    const existingIds = new Set(existing.map((movie) => String(movie._id)));
    const missingIds = movieIds.filter((movieId) => !existingIds.has(movieId));

    const imported = await Promise.all(missingIds.map(async (movieId) => {
        try {
            const [details, credits] = await Promise.all([
                fetchTmdbJson(`/movie/${movieId}`),
                fetchTmdbJson(`/movie/${movieId}/credits`),
            ]);
            // Upsert so a concurrent import cannot fail the whole batch on a duplicate key.
            await Movie.updateOne(
                { _id: movieId },
                { $setOnInsert: toMovieDocument(movieId, details, credits) },
                { upsert: true },
            );
            return true;
        } catch (error) {
            // Log the code only: the raw error carries the TMDB Authorization header.
            console.error(JSON.stringify({
                event: 'trending-import-movie-failed',
                movieId,
                errorCode: error?.code || error?.name || 'UNKNOWN',
            }));
            return false;
        }
    }));

    const count = imported.filter(Boolean).length;
    if (count) await invalidateMovieCatalog();
    return { success: true, count, skipped: existingIds.size };
};
