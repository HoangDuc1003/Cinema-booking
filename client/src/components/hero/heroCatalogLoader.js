import { buildHeroImageCandidates } from './heroImages.js';
import { getClientHeroDayKey } from '../../services/heroCatalogOffset.js';

export const HERO_MAX_MOVIES = 5;
export const HERO_CACHE_KEY = 'nitrocine:hero-catalog-cache-v1';
export const HERO_CACHE_VERSION = 3;

export const getNow = () => performance.now();

export const getHeroMovieKey = (movie, fallback = '') => String(movie?.id || movie?._id || fallback);

export const formatRuntime = (minutes) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
};

export const canLoadImage = (url, signal, timeoutMs = 6_000) => new Promise((resolve) => {
  if (!url || signal?.aborted) {
    resolve(false);
    return;
  }

  const image = new Image();
  let settled = false;
  let timeoutId;
  const cleanup = () => {
    window.clearTimeout(timeoutId);
    image.onload = null;
    image.onerror = null;
    signal?.removeEventListener('abort', handleAbort);
  };
  const finish = (loaded) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolve(loaded);
  };
  const handleAbort = () => {
    finish(false);
  };

  image.onload = () => {
    finish(image.naturalWidth > 0 && image.naturalHeight > 0);
  };
  image.onerror = () => {
    finish(false);
  };
  signal?.addEventListener('abort', handleAbort, { once: true });
  timeoutId = window.setTimeout(() => finish(false), timeoutMs);
  image.src = url;
});

export const validateMovieCandidates = async (movies, signal) => {
  const findFirstLoadable = async (candidates) => {
    for (const url of candidates) {
      if (signal?.aborted) return '';
      if (await canLoadImage(url, signal)) return url;
    }
    return '';
  };

  const putFirst = (candidates, selected) => (
    selected ? [selected, ...candidates.filter((candidate) => candidate !== selected)] : candidates
  );

  const validateMovie = async (movie) => {
    const desktopCandidates = [
      ...buildHeroImageCandidates([
        movie.backdrop_original,
        movie.backdrop_path,
        movie.backdrop_w1280,
        movie.poster_path,
      ], 'original'),
      ...buildHeroImageCandidates([
        movie.backdrop_original,
        movie.backdrop_w1280,
        movie.backdrop_path,
        movie.poster_path,
      ], 'w1280'),
    ];
    const mobileCandidates = [
      ...buildHeroImageCandidates([
        movie.poster_path,
        movie.backdrop_original,
        movie.backdrop_w1280,
        movie.backdrop_path,
      ], 'original'),
      ...buildHeroImageCandidates([
        movie.poster_path,
        movie.backdrop_original,
        movie.backdrop_w1280,
        movie.backdrop_path,
      ], 'w780'),
    ];

    const [heroImageUrl, heroMobileImageUrl] = await Promise.all([
      findFirstLoadable(desktopCandidates),
      findFirstLoadable(mobileCandidates),
    ]);
    const fallbackUrl = heroImageUrl
      || heroMobileImageUrl
      || desktopCandidates[0]
      || mobileCandidates[0];
    if (!fallbackUrl) return null;

    const resolvedHeroImageUrl = heroImageUrl || fallbackUrl;
    const resolvedHeroMobileImageUrl = heroMobileImageUrl || fallbackUrl;

    return {
      ...movie,
      heroImageUrl: resolvedHeroImageUrl,
      heroMobileImageUrl: resolvedHeroMobileImageUrl,
      heroImageCandidates: putFirst(desktopCandidates, resolvedHeroImageUrl),
      heroMobileImageCandidates: putFirst(mobileCandidates, resolvedHeroMobileImageUrl),
    };
  };

  const results = await Promise.all(movies.slice(0, HERO_MAX_MOVIES).map(validateMovie));
  return results.filter(Boolean);
};

export const getInitialHeroMovies = (dayKey = getClientHeroDayKey()) => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const cached = window.sessionStorage.getItem(HERO_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const moviesList = Array.isArray(parsed?.movies) ? parsed.movies : null;
        const cacheIsCurrent = parsed?.version === HERO_CACHE_VERSION
          && parsed?.source === 'server'
          && parsed?.dayKey === dayKey;
        if (cacheIsCurrent && moviesList?.length > 0) {
          return moviesList;
        }
        window.sessionStorage.removeItem(HERO_CACHE_KEY);
      }
    }
  } catch {
    /* ignore storage errors */
  }
  return [];
};

export const saveHeroMoviesCache = (movies, options = {}) => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage && Array.isArray(movies) && movies.length > 0) {
      if (options.source !== 'server') {
        window.sessionStorage.removeItem(HERO_CACHE_KEY);
        return;
      }
      const payload = {
        version: HERO_CACHE_VERSION,
        source: 'server',
        dayKey: options.dayKey || getClientHeroDayKey(),
        movies,
      };
      window.sessionStorage.setItem(HERO_CACHE_KEY, JSON.stringify(payload));
    }
  } catch {
    /* ignore storage errors */
  }
};
