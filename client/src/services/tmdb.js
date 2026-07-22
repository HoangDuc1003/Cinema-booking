// Service: TMDB API helpers
import { dummyShowsData } from '../assets/assets';
import { extractYouTubeVideoId } from '../components/hero/heroVideoSource.js';
import { fetchWithTimeout as requestWithTimeout } from './fetchWithTimeout.js';
import { resolveClientHeroOffset } from './heroCatalogOffset.js';

export { resolveClientHeroOffset } from './heroCatalogOffset.js';

const API_BASE = (import.meta.env.VITE_BASE_URL || '').replace(/\/$/, '');
const IMAGE_BASE = 'https://image.tmdb.org/t/p';
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 4500;
const TRAILER_CACHE_TTL_MS = 30_000;
const trailerResponseCache = new Map();

const fallbackMovies = (limit = dummyShowsData.length) => dummyShowsData.slice(0, limit);

const hasUsableImage = (movie) => Boolean(movie?.poster_path || movie?.backdrop_path || movie?.poster);
const onlyMoviesWithImages = (movies = []) => movies.filter(hasUsableImage);

const getTmdbImageUrl = (path, size) => {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    return `${IMAGE_BASE}/${size}${path}`;
};

const normalizeMovieCard = (movie) => ({
    ...movie,
    _id: String(movie?._id || movie?.id || ''),
    id: movie?.id || movie?._id,
    title: movie?.title || movie?.name || 'Untitled',
    poster_path: getTmdbImageUrl(movie?.poster_path || movie?.poster, 'w500'),
    backdrop_path: getTmdbImageUrl(movie?.backdrop_path, 'w780'),
    popularity: Number(movie?.popularity) || 0,
    vote_average: Number(movie?.vote_average) || 0,
    vote_count: Number(movie?.vote_count) || 0,
});

const getTmdbMovieId = (movie) => {
    const candidate = movie?.id ?? movie?._id ?? movie;
    const value = String(candidate || '').trim();
    return /^\d+$/.test(value) ? value : '';
};

const fetchWithTimeout = async (url, options = {}) => {
    return requestWithTimeout(url, options, { timeoutMs: API_TIMEOUT_MS });
};

const fetchBackendJson = async (path, options = {}) => {
    const response = await fetchWithTimeout(`${API_BASE}/api/show/tmdb${path}`, options);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || `Movie source request failed (${response.status})`);
    }
    return payload.data;
};

export const fetchHomeHero = async ({ signal, offset, fallbackMode = 'mock' } = {}) => {
    try {
        const activeOffset = typeof offset === 'number' && Number.isFinite(offset) && offset >= 0
            ? offset
            : resolveClientHeroOffset();
        const url = `${API_BASE}/api/show/hero?heroOffset=${encodeURIComponent(activeOffset)}`;
        const response = await fetchWithTimeout(url, { signal });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) {
            throw new Error(payload?.message || `Hero request failed (${response.status})`);
        }

        const serverMovies = onlyMoviesWithImages(Array.isArray(payload.movies) ? payload.movies : []);
        if (!serverMovies.length && fallbackMode === 'none') {
            throw new Error('Hero returned no usable server movies.');
        }
        const data = {
            settings: payload.settings || {},
            movies: serverMovies.length ? serverMovies : onlyMoviesWithImages(fallbackMovies(5)),
            source: serverMovies.length ? 'server' : 'fallback',
        };
        return data;
    } catch (error) {
        if (signal?.aborted) throw error;
        if (fallbackMode === 'none') throw error;
        return {
            settings: { mode: 'fallback', effectiveMode: 'fallback' },
            movies: onlyMoviesWithImages(fallbackMovies(5)),
            source: 'fallback',
        };
    }
};

export const fetchMovieTrailers = async (movie, { signal } = {}) => {
    const movieId = getTmdbMovieId(movie);
    if (!movieId) return [];
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    let cached = trailerResponseCache.get(movieId);
    if (cached?.promise) {
        cached = await cached.promise;
    }

    let response;
    if (cached && Date.now() - cached.cachedAt < TRAILER_CACHE_TTL_MS) {
        response = cached;
    } else {
        const request = fetchBackendJson(`/movie/${encodeURIComponent(movieId)}/videos`, { signal })
            .then((data) => ({
                cachedAt: Date.now(),
                title: data.title || '',
                videos: Array.isArray(data.results) ? data.results : [],
            }));
        trailerResponseCache.set(movieId, { promise: request });
        try {
            response = await request;
            trailerResponseCache.set(movieId, response);
        } catch (error) {
            if (trailerResponseCache.get(movieId)?.promise === request) {
                trailerResponseCache.delete(movieId);
            }
            throw error;
        }
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const { videos, title: responseTitle } = response;

    return videos
        .filter((video) => video.site?.toLowerCase() === 'youtube')
        .map((video) => ({ ...video, videoId: extractYouTubeVideoId(video.key) }))
        .filter((video) => video.videoId)
        .sort((a, b) => {
            const score = (video) => {
                const name = `${video.name || ''} ${video.type || ''}`.toLowerCase();
                return (name.includes('official') ? 3 : 0) + (name.includes('trailer') ? 2 : 0) + (video.type === 'Trailer' ? 1 : 0);
            };
            return score(b) - score(a);
        })
        .map((video) => ({
            id: `${movieId}_${video.videoId}`,
            title: movie?.title || movie?.name || responseTitle || 'Movie Trailer',
            release_date: movie?.release_date || '',
            vote_average: movie?.vote_average,
            videoId: video.videoId,
            videoUrl: `https://www.youtube.com/embed/${video.videoId}`,
            thumbnail: `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`,
            videoName: video.name || 'Official Trailer',
            qualityLabel: '1080p',
            isRequestedTrailer: true,
        }));
};

export const fetchHomeNowShowing = async ({ limit = 10, region, signal } = {}) => {
    const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 20);
    const safeRegion = /^[A-Za-z]{2}$/.test(String(region || ''))
        ? String(region).toUpperCase()
        : '';
    try {
        const query = new URLSearchParams({ limit: String(safeLimit) });
        if (safeRegion) query.set('region', safeRegion);
        const data = await fetchBackendJson(`/home-now-showing?${query.toString()}`, { signal });
        const rawMovies = Array.isArray(data?.results) ? data.results : [];
        const movies = onlyMoviesWithImages(rawMovies.map(normalizeMovieCard));
        if (!movies.length) throw new Error('Home Now Showing returned no usable movies.');

        return movies.slice(0, safeLimit);
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        return onlyMoviesWithImages(fallbackMovies(safeLimit).map(normalizeMovieCard));
    }
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
            const data = await fetchBackendJson(`/popular?page=${pageNum}`, { signal: options?.signal });
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
            poster_path: getTmdbImageUrl(movie.poster_path, 'w500'),
            backdrop_path: getTmdbImageUrl(movie.backdrop_path, 'w780'),
            release_date: movie.release_date,
            vote_average: movie.vote_average,
            vote_count: movie.vote_count,
            runtime: movie.runtime,
        })).filter(hasUsableImage);

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
                        backdrop_original: getTmdbImageUrl(d.backdrop_path, 'w1280') || results[i].backdrop_path,
                        backdrop_w1280: getTmdbImageUrl(d.backdrop_path, 'w1280') || results[i].backdrop_path,
                        poster_path: getTmdbImageUrl(d.poster_path, 'w500') || results[i].poster_path,
                        vote_average: d.vote_average ?? results[i].vote_average,
                        genres: d.genres ?? []
                    };
                }
            }
        }

        results = onlyMoviesWithImages(results);

        try {
            storage.setItem(cacheKey, JSON.stringify({ t: Date.now(), data: results }));
        } catch (e) {
            //
        }

        return results;
    } catch (error) {
        if (options?.signal?.aborted || error?.name === 'AbortError') throw error;
        if (options?.fallbackMode === 'none') throw error;
        console.error('Error:', error);
        return onlyMoviesWithImages(fallbackMovies(20));
    }
}

export const fetchMovieDetails = async (id, { signal, fallbackMode = 'mock' } = {}) => {
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

        const data = await fetchBackendJson(`/movie/${encodeURIComponent(id)}`, { signal });

        // Cache the result
        try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), data }));
        } catch (e) {
            // Cache write error, still return data
        }

        return { ...data };
    } catch (e) {
        if (signal?.aborted || e?.name === 'AbortError') throw e;
        if (fallbackMode === 'none') throw e;
        console.error('fetchMovieDetails error', e);
        const fallback = dummyShowsData.find((movie) => String(movie._id || movie.id) === String(id));
        return fallback || null;
    }
}
// services/tmdb.js
export const fetchLatestTrailers = async (opts = { limit: 10 }) => {
    try {
        const limit = opts.limit || 10;
        return await fetchBackendJson(`/trailers?limit=${limit}`);
    } catch { return []; }
};

export const fetchUpcomingMovies = async ({ signal, fallbackMode = 'mock' } = {}) => {
    try {
        const data = await fetchBackendJson('/upcoming?page=1', { signal });
        return onlyMoviesWithImages(data.results.map(movie => ({
            ...movie,
            poster_path: getTmdbImageUrl(movie.poster_path, 'w500'),
            backdrop_path: getTmdbImageUrl(movie.backdrop_path, 'w780'),
        })));
    } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw error;
        if (fallbackMode === 'none') throw error;
        console.error(error);
        return onlyMoviesWithImages(fallbackMovies(12));
    }
}

export const fetchNowPlayingMovies = async ({ signal, fallbackMode = 'mock' } = {}) => {
    try {
        const data = await fetchBackendJson('/now-playing?page=1', { signal });
        return onlyMoviesWithImages(data.results.map(movie => ({
            ...movie,
            poster_path: getTmdbImageUrl(movie.poster_path, 'w500'),
            backdrop_path: getTmdbImageUrl(movie.backdrop_path, 'w780'),
        })));
    } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw error;
        if (fallbackMode === 'none') throw error;
        console.error(error);
        return onlyMoviesWithImages(fallbackMovies(12));
    }
}

export const searchMovies = async (query, { signal } = {}) => {
    const data = await fetchBackendJson(
        `/search?query=${encodeURIComponent(query)}&page=1`,
        { signal },
    );
    return onlyMoviesWithImages((data.results || []).map((movie) => ({
        _id: movie.id.toString(),
        id: movie.id,
        title: movie.title,
        overview: movie.overview,
        poster_path: getTmdbImageUrl(movie.poster_path, 'w500'),
        backdrop_path: getTmdbImageUrl(movie.backdrop_path, 'w780'),
        release_date: movie.release_date,
        vote_average: movie.vote_average,
        vote_count: movie.vote_count,
        runtime: movie.runtime,
    })));
};
