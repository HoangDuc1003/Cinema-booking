import { rememberJson } from './cacheService.js';
import { redisKeys, redisTtl } from './redisKeys.js';
import { fetchTmdbJson } from './tmdbService.js';

export const DEFAULT_TITLE_LANGUAGE = 'en-US';
const MAX_CONCURRENT_LOOKUPS = 4;

// Country (ISO 3166-1, as Vercel reports it) to the language its movie titles and
// synopses are published in. Anything not listed reads English.
const COUNTRY_LANGUAGES = Object.freeze({
    VN: 'vi-VN',
    JP: 'ja-JP',
    KR: 'ko-KR',
    CN: 'zh-CN',
    TW: 'zh-TW',
    HK: 'zh-HK',
    TH: 'th-TH',
    ID: 'id-ID',
    MY: 'ms-MY',
    PH: 'tl-PH',
    IN: 'hi-IN',
    FR: 'fr-FR',
    BE: 'fr-BE',
    CA: 'fr-CA',
    DE: 'de-DE',
    AT: 'de-AT',
    CH: 'de-CH',
    ES: 'es-ES',
    MX: 'es-MX',
    AR: 'es-AR',
    CO: 'es-CO',
    CL: 'es-CL',
    PE: 'es-PE',
    IT: 'it-IT',
    PT: 'pt-PT',
    BR: 'pt-BR',
    NL: 'nl-NL',
    RU: 'ru-RU',
    UA: 'uk-UA',
    PL: 'pl-PL',
    CZ: 'cs-CZ',
    TR: 'tr-TR',
    SE: 'sv-SE',
    NO: 'no-NO',
    DK: 'da-DK',
    FI: 'fi-FI',
    GR: 'el-GR',
    HU: 'hu-HU',
    RO: 'ro-RO',
    IL: 'he-IL',
    SA: 'ar-SA',
    AE: 'ar-AE',
    EG: 'ar-EG',
});

export const languageForCountry = (country) => (
    COUNTRY_LANGUAGES[String(country || '').trim().toUpperCase()] || DEFAULT_TITLE_LANGUAGE
);

/**
 * Where the viewer is, from the country header Vercel adds to every request.
 * Outside production a `?country=JP` query stands in, so the behaviour can be
 * checked from anywhere; in production the header alone decides.
 */
export const resolveViewerCountry = (req) => {
    const header = String(req.get?.('x-vercel-ip-country') || '').trim().toUpperCase();
    const override = process.env.NODE_ENV !== 'production'
        ? String(req.query?.country || '').trim().toUpperCase()
        : '';
    const country = override || header;
    return /^[A-Z]{2}$/.test(country) ? country : '';
};

// One request per movie covers every language and country, so viewers from
// different countries share a single cached lookup.
export const loadMovieTranslations = async (movieId) => {
    const { value } = await rememberJson(
        redisKeys.tmdbMovieTitles(movieId),
        redisTtl.movieTitles,
        async () => {
            const payload = await fetchTmdbJson(`/movie/${movieId}`, {
                append_to_response: 'translations,alternative_titles',
            });
            const translations = {};
            for (const translation of payload?.translations?.translations || []) {
                const language = String(translation?.iso_639_1 || '').toLowerCase();
                const region = String(translation?.iso_3166_1 || '').toUpperCase();
                const text = {
                    title: String(translation?.data?.title || '').trim(),
                    overview: String(translation?.data?.overview || '').trim(),
                };
                if (!language || (!text.title && !text.overview)) continue;
                translations[`${language}-${region}`] = text;
                // The first translation seen for a language fills in for its other regions.
                translations[language] ??= text;
            }
            // Release titles by country. Many older films were released under a local
            // title that nobody entered as a translation, so this catches those.
            const alternativeTitles = {};
            for (const entry of payload?.alternative_titles?.titles || []) {
                const country = String(entry?.iso_3166_1 || '').toUpperCase();
                const title = String(entry?.title || '').trim();
                if (country && title) alternativeTitles[country] ??= title;
            }
            return { translations, alternativeTitles };
        },
    );
    return value || {};
};

/** Picks the title and synopsis for `language`; an empty field means "keep English". */
export const pickMovieText = ({ translations = {}, alternativeTitles = {} } = {}, language) => {
    const [base, country = ''] = language.split('-');
    const exact = translations[language] || {};
    const sameLanguage = translations[base] || {};
    return {
        title: exact.title || sameLanguage.title || alternativeTitles[country.toUpperCase()] || '',
        overview: exact.overview || sameLanguage.overview || '',
    };
};

/**
 * Returns the movies with their title and synopsis in `language`. Genres and
 * everything else stay English. A field with no translation, or a movie whose
 * lookup fails, keeps its English text.
 */
export const localizeMovieText = async (movies, language, { loadTranslations = loadMovieTranslations } = {}) => {
    if (!Array.isArray(movies) || !movies.length || language === DEFAULT_TITLE_LANGUAGE) return movies;

    const localized = new Array(movies.length);
    let next = 0;
    const worker = async () => {
        while (next < movies.length) {
            const index = next;
            next += 1;
            const movie = movies[index];
            const movieId = String(movie?._id ?? movie?.id ?? '');
            try {
                const text = /^\d+$/.test(movieId)
                    ? pickMovieText(await loadTranslations(movieId), language)
                    : { title: '', overview: '' };
                localized[index] = {
                    ...movie,
                    title: text.title || movie.title,
                    overview: text.overview || movie.overview,
                };
            } catch (error) {
                console.warn(JSON.stringify({
                    event: 'movie-translation-unavailable',
                    movieId,
                    language,
                    errorCode: error?.code || error?.name || 'UNKNOWN',
                }));
                localized[index] = movie;
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_LOOKUPS, movies.length) }, worker));
    return localized;
};
