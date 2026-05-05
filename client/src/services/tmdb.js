// chore: TMDB API configuration constants
const API_KEY = '127bc7f7c148cade2892233946154212';
const BASE_URL = 'https://api.themoviedb.org/3';
// Use sized image endpoints rather than 'original' to reduce bandwidth
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

// Cache settings
const CACHE_KEY = 'tmdb_popular_v1';
const CACHE_TTL = 1000 * 60 * 15; // 15 minutes

// feat: Fetch popular movies with optional detail fetching and caching
export const fetchPopularMovies = async (options = { includeDetails: false, detailLimit: 10, dailyRotate: false, dailySeedSize: 20 }) => {
    try {
        // Determine page for daily rotation when requested
        const dailyRotate = options && options.dailyRotate;
        const seedSize = options && Number.isInteger(options.dailySeedSize) ? options.dailySeedSize : 20;
        const page = dailyRotate ? ((Math.floor(Date.now() / 86400000) % seedSize) + 1) : 1;
        const cacheKey = `${CACHE_KEY}_p${page}`;
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.t < CACHE_TTL) {
                    return parsed.data;
                }
            }
        } catch (e) {
            // ignore cache parse errors
        }

        const response = await fetch(`${BASE_URL}/movie/popular?api_key=${API_KEY}&language=en-US&page=${page}`);
        if (!response.ok) throw new Error('Network error!');
        const data = await response.json();

        // Build lightweight results using medium-size images (w500/w780)
        let results = data.results.map((movie) => ({
            _id: movie.id.toString(),
            id: movie.id,
            title: movie.title,
            overview: movie.overview,
            poster_path: movie.poster_path ? `${IMAGE_BASE}/w500${movie.poster_path}` : null,
            // Provide multiple backdrop sizes so caller can pick highest-res for hero
            backdrop_w780: movie.backdrop_path ? `${IMAGE_BASE}/w780${movie.backdrop_path}` : null,
            backdrop_w1280: movie.backdrop_path ? `${IMAGE_BASE}/w1280${movie.backdrop_path}` : null,
            backdrop_original: movie.backdrop_path ? `${IMAGE_BASE}/original${movie.backdrop_path}` : null,
            // keep legacy key for compatibility (medium size)
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

        // Store in session cache (per-page key when rotating daily)
        try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), data: results }));
        } catch (e) {
            // ignore storage quota issues
        }

        return results;
    } catch (error) {
        console.error('Loading movies error:', error);
        return [];
    }
}

    // feat: Fetch latest trailers (YouTube) across now-playing/upcoming movies
    export const fetchLatestTrailers = async (opts = { limit: 10, ttlHours: 2, pagesToSearch: 3 }) => {
        const limit = Number.isInteger(opts.limit) ? opts.limit : 10;
        const ttlMs = (opts.ttlHours && Number(opts.ttlHours) > 0) ? opts.ttlHours * 3600000 : 2 * 3600000;
        const cacheKey = `${CACHE_KEY}_trailers_l${limit}_h${Math.max(1, Math.floor(ttlMs / 3600000))}`;

        try {
            try {
                const cached = sessionStorage.getItem(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (Date.now() - parsed.t < ttlMs) {
                        return parsed.data;
                    }
                }
            } catch (e) {
                // ignore cache parse errors
            }

            const results = [];
            let page = 1;
            const maxPages = opts.pagesToSearch || 3;

            while (results.length < limit && page <= maxPages) {
                try {
                    const resp = await fetch(`${BASE_URL}/movie/now_playing?api_key=${API_KEY}&language=en-US&page=${page}`);
                    if (!resp.ok) break;
                    const data = await resp.json();

                    for (const mv of data.results) {
                        try {
                            const vResp = await fetch(`${BASE_URL}/movie/${mv.id}/videos?api_key=${API_KEY}&language=en-US`);
                            if (!vResp.ok) continue;
                            const vData = await vResp.json();
                            const videos = Array.isArray(vData.results) ? vData.results : [];
                            const officialCandidates = videos
                                .filter(v => (v.site === 'YouTube' || v.site === 'youtube') && v.type === 'Trailer' && v.official)
                                .filter(v => {
                                    const n = (v.name || '').toLowerCase();
                                    return !n.includes('short') && !n.includes('teaser') && !n.includes('clip') && !n.includes('tv spot');
                                })
                                .sort((a, b) => (b.size || 0) - (a.size || 0));

                            const trailer = officialCandidates[0];
                            if (trailer) {
                                const videoUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
                                const qualityLabel = trailer.size ? `${trailer.size}p` : 'HD';
                                results.push({
                                    id: mv.id,
                                    title: mv.title || mv.name,
                                    overview: mv.overview,
                                    release_date: mv.release_date,
                                    poster_path: mv.poster_path ? `${IMAGE_BASE}/w500${mv.poster_path}` : null,
                                    backdrop_path: mv.backdrop_path ? `${IMAGE_BASE}/w1280${mv.backdrop_path}` : null,
                                    videoUrl,
                                    videoName: trailer.name,
                                    qualityLabel,
                                });
                            }
                        } catch (e) {
                            // ignore per-movie video errors
                        }
                        if (results.length >= limit) break;
                    }
                } catch (e) {
                    // ignore page fetch errors
                }
                page += 1;
            }

            try {
                sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), data: results.slice(0, limit) }));
            } catch (e) {
                // ignore storage quota issues
            }

            return results.slice(0, limit);
        } catch (error) {
            console.error('Loading trailers error:', error);
            return [];
        }
    };