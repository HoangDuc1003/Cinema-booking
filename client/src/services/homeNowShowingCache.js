export const HOME_NOW_SHOWING_CACHE_KEY = 'nitrocine:home-now-showing-cache-v1';
export const HOME_NOW_SHOWING_CACHE_SCHEMA_VERSION = 1;
export const HOME_NOW_SHOWING_FRESH_TTL_MS = 5 * 60 * 1000;
export const HOME_NOW_SHOWING_MAX_STALE_MS = 48 * 60 * 60 * 1000;

const getStorage = () => (
  typeof window !== 'undefined' ? window.localStorage : null
);

const hasUsableImage = (movie) => Boolean(
  movie?.poster_path || movie?.backdrop_path || movie?.poster,
);

export const isValidHomeNowShowingMovies = (movies) => (
  Array.isArray(movies)
  && movies.length > 0
  && movies.every((movie) => (
    movie
    && String(movie._id || movie.id || '').trim()
    && String(movie.title || movie.name || '').trim()
    && hasUsableImage(movie)
  ))
);

export const readHomeNowShowingCache = (nowMs = Date.now()) => {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(HOME_NOW_SHOWING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAtMs = Date.parse(parsed?.savedAt || '');
    const ageMs = nowMs - savedAtMs;
    const valid = parsed?.schemaVersion === HOME_NOW_SHOWING_CACHE_SCHEMA_VERSION
      && parsed?.source === 'server'
      && Number.isFinite(savedAtMs)
      && ageMs >= 0
      && ageMs <= HOME_NOW_SHOWING_MAX_STALE_MS
      && isValidHomeNowShowingMovies(parsed.movies);

    if (!valid) {
      storage.removeItem(HOME_NOW_SHOWING_CACHE_KEY);
      return null;
    }

    return {
      movies: parsed.movies,
      meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {},
      source: 'stale-server-cache',
      savedAt: parsed.savedAt,
      ageMs,
      fresh: ageMs <= HOME_NOW_SHOWING_FRESH_TTL_MS,
    };
  } catch {
    try {
      storage.removeItem(HOME_NOW_SHOWING_CACHE_KEY);
    } catch {
      // Storage may be unavailable or quota-protected.
    }
    return null;
  }
};

export const saveHomeNowShowingCache = ({ movies, meta = {}, source } = {}) => {
  if (source !== 'server' || !isValidHomeNowShowingMovies(movies)) return false;

  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(HOME_NOW_SHOWING_CACHE_KEY, JSON.stringify({
      schemaVersion: HOME_NOW_SHOWING_CACHE_SCHEMA_VERSION,
      source: 'server',
      savedAt: new Date().toISOString(),
      meta,
      movies,
    }));
    return true;
  } catch {
    return false;
  }
};
