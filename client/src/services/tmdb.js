// chore: TMDB API configuration constants
const API_KEY = '127bc7f7c148cade2892233946154212';
const BASE_URL = 'https://api.themoviedb.org/3';
// Use sized image endpoints rather than 'original' to reduce bandwidth
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

// Cache settings
const CACHE_KEY = 'tmdb_popular_v1';
const CACHE_TTL = 1000 * 60 * 15; // 15 minutes

// feat: Fetch popular movies with optional detail fetching and caching
export const fetchPopularMovies = async (options = { includeDetails: false, detailLimit: 10 }) => {
    try {
        // Return cached results when available and fresh
        try {
            const cached = sessionStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.t < CACHE_TTL) {
                    return parsed.data;
                }
            }
        } catch (e) {
            // ignore cache parse errors
        }

        const response = await fetch(`${BASE_URL}/movie/popular?api_key=${API_KEY}&language=en-US&page=1`);
        if (!response.ok) throw new Error('Network error!');
        const data = await response.json();

        // Build lightweight results using medium-size images (w500/w780)
        let results = data.results.map((movie) => ({
            _id: movie.id.toString(),
            id: movie.id,
            title: movie.title,
            overview: movie.overview,
            poster_path: movie.poster_path ? `${IMAGE_BASE}/w500${movie.poster_path}` : null,
            backdrop_path: movie.backdrop_path ? `${IMAGE_BASE}/w780${movie.backdrop_path}` : null,
            release_date: movie.release_date,
            vote_average: movie.vote_average,
            vote_count: movie.vote_count,
            // runtime left null unless requested (fetching per-movie details is expensive)
            runtime: null,
        }));

        // Optionally fetch details (runtime) for a limited number of movies
        if (options && options.includeDetails) {
            const limit = Number.isInteger(options.detailLimit) ? options.detailLimit : 10;
            const withRuntime = await Promise.all(
                results.map(async (mv, idx) => {
                    if (idx >= limit) return mv;
                    try {
                        const detailResp = await fetch(`${BASE_URL}/movie/${mv.id}?api_key=${API_KEY}&language=en-US`);
                        if (detailResp.ok) {
                            const detailData = await detailResp.json();
                            mv.runtime = detailData.runtime ?? mv.runtime;
                        }
                    } catch (e) {
                        // ignore per-movie detail errors
                    }
                    return mv;
                })
            );
            results = withRuntime;
        }

        // Store in session cache
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: results }));
        } catch (e) {
            // ignore storage quota issues
        }

        return results;
    } catch (error) {
        console.error('Loading movies error:', error);
        return [];
    }
}