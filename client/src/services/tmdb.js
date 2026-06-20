// Service: TMDB API helpers
const API_BASE = (import.meta.env.VITE_BASE_URL || '').replace(/\/$/, '');
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

const fetchBackendJson = async (path, options = {}) => {
    const response = await fetch(`${API_BASE}/api/show/tmdb${path}`, options);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || `Movie source request failed (${response.status})`);
    }
    return payload.data;
};

// Cache settings
const CACHE_KEY = 'tmdb_popular_v1';
const CACHE_TTL = 1000 * 60 * 15;

export const fetchPopularMovies = async (options = { includeDetails: false, detailLimit: 10, dailyRotate: false, dailySeedSize: 20, pages: 1, maxAdult: 2 }) => {
    try {
        const randomRotate = options && options.randomRotate;
        const seedSize = options && Number.isInteger(options.dailySeedSize) ? options.dailySeedSize : 20;
        const basePage = randomRotate ? (Math.floor(Math.random() * seedSize) + 1) : 1;
        const totalPages = options?.pages || 1;
        const maxAdult = options?.maxAdult ?? 2;
        const cacheKey = `${CACHE_KEY}_p${basePage}_n${totalPages}`;

        // Use sessionStorage so it changes per session/reload if randomized
        const storage = sessionStorage;
        const ttl = CACHE_TTL;

        try {
            const cached = storage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.t < ttl) return parsed.data;
            }
        } catch (e) {
            //
        }

        // Fetch one or more pages
        let allMovies = [];
        for (let p = 0; p < totalPages; p++) {
            const pageNum = basePage + p;
            const data = await fetchBackendJson(`/popular?page=${pageNum}`);
            allMovies.push(...data.results);
        }

        // MongoDB fallback may return the same catalog for different TMDB pages.
        allMovies = [...new Map(allMovies.map((movie) => [String(movie.id || movie._id), movie])).values()];

        // Filter adult content: allow at most maxAdult adult-flagged movies
        let adultCount = 0;
        allMovies = allMovies.filter(movie => {
            if (movie.adult) {
                adultCount++;
                return adultCount <= maxAdult;
            }
            return true;
        });

        let results = allMovies.map((movie) => ({
            _id: movie.id.toString(),
            id: movie.id,
            title: movie.title,
            overview: movie.overview,
            adult: movie.adult || false,
            poster_path: movie.poster_path ? `${IMAGE_BASE}/w500${movie.poster_path}` : null,
            backdrop_path: movie.backdrop_path ? `${IMAGE_BASE}/w780${movie.backdrop_path}` : null,
            release_date: movie.release_date,
            vote_average: movie.vote_average,
            vote_count: movie.vote_count,
            runtime: movie.runtime,
        }));

        // Optionally fetch detailed info (runtime, genres, higher-res backdrops)
        if (options && options.includeDetails) {
            const limit = Math.min(Number(options.detailLimit) || 0, results.length);
            if (limit > 0) {
                const detailPromises = results.slice(0, limit).map(r =>
                    fetchBackendJson(`/movie/${r.id}`)
                        .catch(() => null)
                );

                const details = await Promise.all(detailPromises);
                for (let i = 0; i < limit; i++) {
                    const d = details[i];
                    if (!d) continue;
                    results[i] = {
                        ...results[i],
                        runtime: d.runtime ?? results[i].runtime,
                        backdrop_original: d.backdrop_path ? `${IMAGE_BASE}/w1280${d.backdrop_path}` : results[i].backdrop_path,
                        backdrop_w1280: d.backdrop_path ? `${IMAGE_BASE}/w1280${d.backdrop_path}` : results[i].backdrop_path,
                        poster_path: d.poster_path ? `${IMAGE_BASE}/w500${d.poster_path}` : results[i].poster_path,
                        vote_average: d.vote_average ?? results[i].vote_average,
                        genres: d.genres ?? []
                    };
                }
            }
        }

        try {
            storage.setItem(cacheKey, JSON.stringify({ t: Date.now(), data: results }));
        } catch (e) {
            //
        }

        return results;
    } catch (error) {
        console.error('Error:', error);
        return [];
    }
}

export const fetchMovieDetails = async (id) => {
    try {
        const cacheKey = `tmdb_movie_details_${id}`;
        const CACHE_TTL_24H = 1000 * 60 * 60 * 24; // 24 hours in milliseconds

        // Check cache first
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.t < CACHE_TTL_24H) {
                    return parsed.data;
                }
            }
        } catch (e) {
            // Cache read error, proceed with API call
        }

        const data = await fetchBackendJson(`/movie/${encodeURIComponent(id)}`);

        // Cache the result
        try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), data }));
        } catch (e) {
            // Cache write error, still return data
        }

        return { ...data };
    } catch (e) {
        console.error('fetchMovieDetails error', e);
        return null;
    }
}
// services/tmdb.js
export const fetchLatestTrailers = async (opts = { limit: 10, ttlHours: 2, pagesToSearch: 4 }) => {
    try {
        const limit = opts.limit || 10;
        const pages = opts.pagesToSearch || 4;
        return await fetchBackendJson(`/trailers?limit=${limit}&pages=${pages}`);
    } catch { return []; }
};

export const fetchUpcomingMovies = async () => {
    try {
        const data = await fetchBackendJson('/upcoming?page=1');
        return data.results.map(movie => ({
            ...movie,
            poster_path: movie.poster_path ? `${IMAGE_BASE}/w500${movie.poster_path}` : null,
            backdrop_path: movie.backdrop_path ? `${IMAGE_BASE}/w780${movie.backdrop_path}` : null,
        }));
    } catch (error) {
        console.error(error);
        return [];
    }
}

export const fetchNowPlayingMovies = async () => {
    try {
        const data = await fetchBackendJson('/now-playing?page=1');
        return data.results.map(movie => ({
            ...movie,
            poster_path: movie.poster_path ? `${IMAGE_BASE}/w500${movie.poster_path}` : null,
            backdrop_path: movie.backdrop_path ? `${IMAGE_BASE}/w780${movie.backdrop_path}` : null,
        }));
    } catch (error) {
        console.error(error);
        return [];
    }
}

export const searchMovies = async (query, { signal } = {}) => {
    const data = await fetchBackendJson(
        `/search?query=${encodeURIComponent(query)}&page=1`,
        { signal },
    );
    return (data.results || []).map((movie) => ({
        _id: movie.id.toString(),
        id: movie.id,
        title: movie.title,
        overview: movie.overview,
        poster_path: movie.poster_path ? `${IMAGE_BASE}/w500${movie.poster_path}` : null,
        backdrop_path: movie.backdrop_path ? `${IMAGE_BASE}/w780${movie.backdrop_path}` : null,
        release_date: movie.release_date,
        vote_average: movie.vote_average,
        vote_count: movie.vote_count,
        runtime: movie.runtime,
    }));
};
