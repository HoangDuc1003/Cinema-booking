import { buildHeroImageCandidates } from './heroImages.js';

export const HERO_MAX_MOVIES = 5;
export const HERO_CACHE_KEY = 'nitrocine:hero-catalog-cache-v2';
export const HERO_CACHE_VERSION = 4;
export const HERO_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
  if (signal?.aborted) return [];
  const prepareMovie = (movie) => {
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
    const heroImageUrl = desktopCandidates[0] || mobileCandidates[0] || '';
    const heroMobileImageUrl = mobileCandidates[0] || heroImageUrl;
    const fallbackUrl = heroImageUrl || heroMobileImageUrl;
    if (!fallbackUrl) return null;

    return {
      ...movie,
      heroImageUrl: heroImageUrl || fallbackUrl,
      heroMobileImageUrl: heroMobileImageUrl || fallbackUrl,
      heroImageCandidates: desktopCandidates,
      heroMobileImageCandidates: mobileCandidates,
    };
  };

  return movies.slice(0, HERO_MAX_MOVIES).map(prepareMovie).filter(Boolean);
};

const getStorage = () => (
  typeof window !== 'undefined' ? window.localStorage : null
);

const normalizeCacheMeta = (meta = {}) => ({
  batchId: meta.batchId == null ? '' : String(meta.batchId),
  version: meta.version == null ? '' : String(meta.version),
  generatedAt: meta.generatedAt ?? '',
  nextRefreshAt: meta.nextRefreshAt ?? '',
  timezone: meta.timezone ?? 'Asia/Ho_Chi_Minh',
  dateKey: meta.dateKey ?? '',
  dailyEntropy: meta.dailyEntropy ?? '',
  fetchedAt: meta.fetchedAt ?? '',
});

const hasUniqueMovieOrder = (movies) => {
  const ids = movies.map((movie, index) => getHeroMovieKey(movie, index));
  return ids.every(Boolean) && new Set(ids).size === ids.length;
};

export const getInitialHeroPayload = (nowMs = Date.now()) => {
  try {
    const storage = getStorage();
    const cached = storage?.getItem(HERO_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    const rawMovies = Array.isArray(parsed?.movies) ? parsed.movies : [];
    const movies = rawMovies.slice(0, HERO_MAX_MOVIES);
    const meta = normalizeCacheMeta(parsed?.meta);
    const cachedAt = Date.parse(parsed?.cachedAt || '');
    const valid = parsed?.schemaVersion === HERO_CACHE_VERSION
      && parsed?.source === 'server'
      && rawMovies.length === HERO_MAX_MOVIES
      && movies.length === HERO_MAX_MOVIES
      && hasUniqueMovieOrder(movies)
      && meta.version !== ''
      && Number.isFinite(cachedAt)
      && nowMs - cachedAt >= 0
      && nowMs - cachedAt <= HERO_CACHE_MAX_AGE_MS;
    if (!valid) {
      storage?.removeItem(HERO_CACHE_KEY);
      return null;
    }
    return {
      movies,
      settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {},
      meta,
      source: 'server',
      cachedAt: parsed.cachedAt,
    };
  } catch {
    try {
      getStorage()?.removeItem(HERO_CACHE_KEY);
    } catch {
      // Storage may be unavailable.
    }
  }
  return null;
};

export const getInitialHeroMovies = () => getInitialHeroPayload()?.movies || [];

export const saveHeroMoviesCache = (movies, options = {}) => {
  try {
    const storage = getStorage();
    const meta = normalizeCacheMeta(options.meta);
    if (!storage) return false;
    if (
      options.source !== 'server'
      || !Array.isArray(movies)
      || movies.length !== HERO_MAX_MOVIES
      || !hasUniqueMovieOrder(movies)
      || meta.version === ''
    ) {
      storage.removeItem(HERO_CACHE_KEY);
      return false;
    }
    const payload = {
      schemaVersion: HERO_CACHE_VERSION,
      source: 'server',
      cachedAt: new Date().toISOString(),
      meta,
      settings: options.settings && typeof options.settings === 'object' ? options.settings : {},
      movies,
    };
    storage.setItem(HERO_CACHE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
};
