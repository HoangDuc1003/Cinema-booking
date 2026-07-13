const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const TMDB_IMAGE_HOSTS = new Set(['image.tmdb.org', 'media.themoviedb.org']);
const TMDB_IMAGE_PATH = /^\/[A-Za-z0-9_-]+\.(?:avif|jpe?g|png|webp)$/i;

const runtimeApiBase = (import.meta.env?.VITE_BASE_URL || '').replace(/\/$/, '');

export const extractTmdbImagePath = (value) => {
  const source = String(value || '').trim();
  if (!source) return '';

  if (TMDB_IMAGE_PATH.test(source)) return source;

  try {
    const parsed = new URL(source);
    if (!TMDB_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) return '';
    const match = parsed.pathname.match(/^\/t\/p\/[^/]+(\/[A-Za-z0-9_-]+\.(?:avif|jpe?g|png|webp))$/i);
    return match?.[1] || '';
  } catch {
    return '';
  }
};

export const getTmdbImageUrl = (value, size = 'original') => {
  const source = String(value || '').trim();
  if (!source) return '';

  const tmdbPath = extractTmdbImagePath(source);
  if (tmdbPath) return `${TMDB_IMAGE_BASE}/${size}${tmdbPath}`;
  return /^https?:\/\//i.test(source) ? source : '';
};

export const getTmdbImageProxyUrl = (value, size = 'original', apiBase = runtimeApiBase) => {
  const tmdbPath = extractTmdbImagePath(value);
  if (!tmdbPath) return '';

  const query = new URLSearchParams({ path: tmdbPath, size });
  return `${String(apiBase || '').replace(/\/$/, '')}/api/show/tmdb/image?${query}`;
};

export const buildHeroImageCandidates = (values, size, apiBase = runtimeApiBase) => {
  const sources = Array.isArray(values) ? values : [values];
  const candidates = [];

  sources.filter(Boolean).forEach((source) => {
    const direct = getTmdbImageUrl(source, size);
    const proxy = getTmdbImageProxyUrl(source, size, apiBase);
    if (direct) candidates.push(direct);
    if (proxy) candidates.push(proxy);
  });

  return [...new Set(candidates)];
};

