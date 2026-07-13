import axios from 'axios';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const TMDB_IMAGE_HOSTS = new Set(['image.tmdb.org', 'media.themoviedb.org']);
const TMDB_IMAGE_SIZES = new Set(['w300', 'w342', 'w500', 'w780', 'w1280', 'original']);
const TMDB_IMAGE_PATH = /^\/[A-Za-z0-9_-]+\.(?:avif|jpe?g|png|webp)$/i;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const normalizeTmdbImageSize = (value) => {
    const size = String(value || 'w780').trim().toLowerCase();
    return TMDB_IMAGE_SIZES.has(size) ? size : '';
};

export const normalizeTmdbImagePath = (value) => {
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

export const fetchTmdbImage = async ({ path, size, fetcher = axios.get }) => {
    const normalizedPath = normalizeTmdbImagePath(path);
    const normalizedSize = normalizeTmdbImageSize(size);
    if (!normalizedPath || !normalizedSize) {
        const error = new Error('Invalid TMDB image request');
        error.status = 400;
        throw error;
    }

    const response = await fetcher(`${TMDB_IMAGE_BASE}/${normalizedSize}${normalizedPath}`, {
        responseType: 'arraybuffer',
        timeout: Number(process.env.TMDB_IMAGE_TIMEOUT_MS) || 6_000,
        maxContentLength: MAX_IMAGE_BYTES,
        maxBodyLength: MAX_IMAGE_BYTES,
        headers: { Accept: 'image/avif,image/webp,image/*' },
        validateStatus: (status) => status === 200,
    });
    const contentType = String(response.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) {
        const error = new Error('TMDB returned a non-image response');
        error.status = 502;
        throw error;
    }

    const body = Buffer.from(response.data);
    if (!body.length || body.length > MAX_IMAGE_BYTES) {
        const error = new Error('TMDB image response has an invalid size');
        error.status = 502;
        throw error;
    }

    return { body, contentType };
};

