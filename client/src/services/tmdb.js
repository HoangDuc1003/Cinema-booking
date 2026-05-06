// Service: TMDB API helpers
const API_KEY = '127bc7f7c148cade2892233946154212';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

// Cache settings
const CACHE_KEY = 'tmdb_popular_v1';
const CACHE_TTL = 1000 * 60 * 15;

export const fetchPopularMovies = async (options = { includeDetails: false, detailLimit: 10, dailyRotate: false, dailySeedSize: 20 }) => {
    try {
        const dailyRotate = options && options.dailyRotate;
        const seedSize = options && Number.isInteger(options.dailySeedSize) ? options.dailySeedSize : 20;
        const page = dailyRotate ? ((Math.floor(Date.now() / 86400000) % seedSize) + 1) : 1;
        const cacheKey = `${CACHE_KEY}_p${page}`;

        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.t < CACHE_TTL) return parsed.data;
            }
        } catch (e) {
            //
        }

        const response = await fetch(`${BASE_URL}/movie/popular?api_key=${API_KEY}&language=en-US&page=${page}`);
        if (!response.ok) throw new Error('Network error!');
        const data = await response.json();

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
            runtime: movie.runtime,
        }));

        // Optionally fetch detailed info (runtime, genres, higher-res backdrops)
        if (options && options.includeDetails) {
            const limit = Math.min(Number(options.detailLimit) || 0, results.length);
            if (limit > 0) {
                const detailPromises = results.slice(0, limit).map(r =>
                    fetch(`${BASE_URL}/movie/${r.id}?api_key=${API_KEY}&language=en-US&append_to_response=credits`)
                        .then(res => res.ok ? res.json() : null)
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
            sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), data: results }));
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
        const resp = await fetch(`${BASE_URL}/movie/${id}?api_key=${API_KEY}&language=en-US&append_to_response=credits`);
        if (!resp.ok) throw new Error('Failed to fetch movie details');
        const data = await resp.json();


        return { ...data };
    } catch (e) {
        console.error('fetchMovieDetails error', e);
        return null;
    }
}
// services/tmdb.js
export const fetchLatestTrailers = async (opts = { limit: 10, ttlHours: 2, pagesToSearch: 4 }) => {

    try {
        const results = [];
        let page = 1;
        while (results.length < (opts.limit || 10) && page <= (opts.pagesToSearch || 4)) {
            const resp = await fetch(`${BASE_URL}/movie/now_playing?api_key=${API_KEY}&page=${page}`);
            const data = await resp.json();

            for (const mv of data.results) {
                const vResp = await fetch(`${BASE_URL}/movie/${mv.id}/videos?api_key=${API_KEY}`);
                const vData = await vResp.json();
                const video = vData.results?.find(v => v.site.toLowerCase() === 'youtube' && v.type === 'Trailer');

                if (video) {
                    results.push({
                        id: mv.id,
                        title: mv.title,
                        overview: mv.overview,
                        release_date: mv.release_date,
                        backdrop_path: mv.backdrop_path ? `${IMAGE_BASE}/w1280${mv.backdrop_path}` : null,
                        videoUrl: `https://www.youtube.com/embed/${video.key}`,
                        thumbnail: `https://img.youtube.com/vi/${video.key}/maxresdefault.jpg`,
                        videoName: video.name,
                        qualityLabel: '1080p'
                    });
                }
            }
            page++;
        }
        return results;
    } catch (e) { return []; }
};