// Service: TMDB API helpers
import { dummyShowsData } from '../assets/assets';
import { extractYouTubeVideoId } from '../lib/youtubeVideo.js';
import { fetchWithTimeout as requestWithTimeout } from './fetchWithTimeout.js';

const RAW_BASE = (import.meta.env.VITE_BASE_URL || '').trim().replace(/\/$/, '');
const API_BASE = import.meta.env.DEV ? '' : RAW_BASE;
const IMAGE_BASE = 'https://image.tmdb.org/t/p';
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 4500;
const HERO_API_TIMEOUT_MS = Number(import.meta.env.VITE_HERO_API_TIMEOUT_MS) || 12_000;
const SHOWTIME_API_TIMEOUT_MS = Number(import.meta.env.VITE_SHOWTIME_API_TIMEOUT_MS) || 10_000;
const TRAILER_CACHE_TTL_MS = 30_000;
const trailerResponseCache = new Map();
const HERO_SHARED_ABORT_GRACE_MS = 75;
let sharedHeroRequest = null;
let lastHeroResponse = null;
let lastHeroEtag = '';

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

export class HttpError extends Error {
    constructor(response) {
        super(`HTTP ${response.status} ${response.statusText}`.trim());
        this.name = 'HttpError';
        this.status = response.status;
    }
}

const fetchWithTimeout = async (url, options = {}, timeoutMs = API_TIMEOUT_MS) => {
    return requestWithTimeout(url, options, { timeoutMs });
};

const fetchBackendJson = async (path, options = {}, timeoutMs = API_TIMEOUT_MS) => {
    const response = await fetchWithTimeout(`${API_BASE}/api/show/tmdb${path}`, options, timeoutMs);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || `Movie source request failed (${response.status})`);
    }
    return payload.data;
};

const normalizeHeroResponse = (payload) => {
    const movies = onlyMoviesWithImages(
        Array.isArray(payload?.movies) ? payload.movies : [],
    ).slice(0, 5);
    if (!movies.length) throw new Error('Hero returned no usable server movies.');

    const rotation = payload.rotation && typeof payload.rotation === 'object'
        ? payload.rotation
        : {};
    const meta = {
        batchId: String(payload.batchId ?? payload.meta?.batchId ?? ''),
        version: String(payload.version ?? payload.meta?.version ?? rotation.key ?? ''),
        generatedAt: payload.generatedAt ?? payload.meta?.generatedAt ?? '',
        nextRefreshAt: payload.nextRefreshAt ?? payload.meta?.nextRefreshAt ?? rotation.endsAt ?? '',
        timezone: payload.timezone ?? payload.meta?.timezone ?? 'Asia/Ho_Chi_Minh',
        fetchedAt: new Date().toISOString(),
    };

    return {
        settings: payload.settings || {},
        meta,
        rotation: {
            ...rotation,
            key: rotation.key || meta.version,
            endsAt: rotation.endsAt || meta.nextRefreshAt,
        },
        movies,
        source: 'server',
    };
};

const loadHomeHeroFromServer = async (signal) => {
    const headers = {};
    if (lastHeroEtag && lastHeroResponse) headers['If-None-Match'] = lastHeroEtag;
    const response = await fetchWithTimeout(
        `${API_BASE}/api/show/hero`,
        { signal, headers },
        HERO_API_TIMEOUT_MS,
    );
    if (response.status === 304 && lastHeroResponse) return lastHeroResponse;
    if (!response.ok) throw new HttpError(response);

    const payload = await response.json().catch(() => null);
    if (!payload?.success) {
        throw new Error(payload?.message || `Hero request failed (${response.status})`);
    }
    const normalized = normalizeHeroResponse(payload);
    lastHeroEtag = response.headers.get('etag') || '';
    lastHeroResponse = normalized;
    return normalized;
};

const getSharedHeroRequest = () => {
    if (sharedHeroRequest) {
        window.clearTimeout(sharedHeroRequest.abortTimer);
        sharedHeroRequest.abortTimer = null;
        return sharedHeroRequest;
    }

    const controller = new AbortController();
    const request = {
        controller,
        consumers: new Set(),
        abortTimer: null,
        promise: null,
        settled: false,
    };
    request.promise = loadHomeHeroFromServer(controller.signal)
        .finally(() => {
            request.settled = true;
            if (sharedHeroRequest !== request || request.consumers.size) return;
            window.clearTimeout(request.abortTimer);
            request.abortTimer = window.setTimeout(() => {
                if (!request.consumers.size && sharedHeroRequest === request) {
                    sharedHeroRequest = null;
                }
            }, HERO_SHARED_ABORT_GRACE_MS);
        });
    sharedHeroRequest = request;
    return request;
};

const releaseHeroConsumer = (request, consumer) => {
    request.consumers.delete(consumer);
    if (request.consumers.size || sharedHeroRequest !== request) return;
    window.clearTimeout(request.abortTimer);
    request.abortTimer = window.setTimeout(() => {
        if (!request.consumers.size && sharedHeroRequest === request) {
            sharedHeroRequest = null;
            if (!request.settled) {
                request.controller.abort(new DOMException('Hero request abandoned', 'AbortError'));
            }
        }
    }, HERO_SHARED_ABORT_GRACE_MS);
};

export const fetchHomeHero = ({ signal } = {}) => {
    const request = getSharedHeroRequest();
    const consumer = {};
    request.consumers.add(consumer);

    return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
            signal?.removeEventListener?.('abort', handleAbort);
            releaseHeroConsumer(request, consumer);
        };
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            cleanup();
            callback(value);
        };
        const handleAbort = () => finish(
            reject,
            signal?.reason || new DOMException('Aborted', 'AbortError'),
        );

        if (signal?.aborted) {
            handleAbort();
            return;
        }
        signal?.addEventListener?.('abort', handleAbort, { once: true });
        request.promise.then(
            (value) => finish(resolve, value),
            (error) => finish(reject, error),
        );
    });
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

        const data = await fetchBackendJson(
            `/movie/${encodeURIComponent(id)}`,
            { signal },
            SHOWTIME_API_TIMEOUT_MS,
        );

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

export const fetchMovieShowtimes = async (id, { signal } = {}) => {
    const movieId = String(id || '').trim();
    if (!/^\d+$/.test(movieId)) throw new TypeError('A valid movie ID is required.');
    const response = await fetchWithTimeout(
        `${API_BASE}/api/show/${encodeURIComponent(movieId)}`,
        { signal },
        SHOWTIME_API_TIMEOUT_MS,
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success || !payload?.movie || !payload?.dateTime) {
        throw new Error(payload?.message || `Showtime request failed (${response.status})`);
    }
    return {
        movie: payload.movie,
        dateTime: payload.dateTime,
    };
};

export const fetchSimilarMovies = async (id, { signal, limit = 4 } = {}) => {
    const movieId = String(id || '').trim();
    if (!/^\d+$/.test(movieId)) throw new TypeError('A valid movie ID is required.');
    const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 4, 1), 20);
    const data = await fetchBackendJson(
        `/movie/${encodeURIComponent(movieId)}/similar?limit=${safeLimit}`,
        { signal },
        SHOWTIME_API_TIMEOUT_MS,
    );
    const movies = Array.isArray(data?.results)
        ? data.results.map(normalizeMovieCard)
        : [];
    return onlyMoviesWithImages(movies)
        .filter((movie) => String(movie.id || movie._id) !== movieId)
        .slice(0, safeLimit);
};
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
