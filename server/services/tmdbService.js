import axios from 'axios';

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';

const tmdbHeaders = () => ({
    Authorization: `Bearer ${process.env.TMDB_API_KEY || ''}`,
});

export const fetchTmdbJson = async (path, params = {}) => {
    if (!process.env.TMDB_API_KEY) {
        throw Object.assign(new Error('TMDB_API_KEY is not configured'), {
            code: 'INVALID_CONFIGURATION',
            statusCode: 503,
        });
    }

    const { data } = await axios.get(`${TMDB_API_BASE_URL}${path}`, {
        headers: tmdbHeaders(),
        params,
        timeout: Number(process.env.TMDB_TIMEOUT_MS) || 5000,
    });
    return data;
};

export default fetchTmdbJson;
