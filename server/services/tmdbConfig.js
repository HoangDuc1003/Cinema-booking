// Shared by the now-showing list, the Hero and the showtime sync. Kept in its own
// module so those services can import each other's data without an import cycle.
export const TMDB_REGION = 'VN';
// Movie text is English everywhere. Only titles follow the viewer (movieTitleService).
export const TMDB_LANGUAGE = 'en-US';

// TMDB list endpoints return genre IDs only. The movie genre list is fixed, so a
// static table saves a request per poster.
export const TMDB_MOVIE_GENRES = Object.freeze({
    12: 'Adventure',
    14: 'Fantasy',
    16: 'Animation',
    18: 'Drama',
    27: 'Horror',
    28: 'Action',
    35: 'Comedy',
    36: 'History',
    37: 'Western',
    53: 'Thriller',
    80: 'Crime',
    99: 'Documentary',
    878: 'Science Fiction',
    9648: 'Mystery',
    10402: 'Music',
    10749: 'Romance',
    10751: 'Family',
    10752: 'War',
    10770: 'TV Movie',
});
