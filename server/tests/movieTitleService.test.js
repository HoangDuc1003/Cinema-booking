import assert from 'node:assert/strict';
import test from 'node:test';
import {
    languageForCountry,
    localizeMovieText,
    pickMovieText,
    resolveViewerCountry,
} from '../services/movieTitleService.js';

const movies = [
    { _id: '1', id: '1', title: 'Spirited Away', overview: 'English synopsis', genres: [{ id: 16, name: 'Animation' }] },
    { _id: '2', id: '2', title: 'Parasite', overview: 'Another', genres: [] },
];

test('a country maps to its language, and unknown countries read English', () => {
    assert.equal(languageForCountry('VN'), 'vi-VN');
    assert.equal(languageForCountry('jp'), 'ja-JP');
    assert.equal(languageForCountry('US'), 'en-US');
    assert.equal(languageForCountry('ZZ'), 'en-US');
    assert.equal(languageForCountry(''), 'en-US');
});

test('the country comes from the Vercel header; the query override is ignored in production', () => {
    const req = (header, country) => ({
        get: (name) => (name.toLowerCase() === 'x-vercel-ip-country' ? header : undefined),
        query: { country },
    });
    assert.equal(resolveViewerCountry(req('vn')), 'VN');
    assert.equal(resolveViewerCountry(req('not-a-country')), '');

    const previous = process.env.NODE_ENV;
    try {
        process.env.NODE_ENV = 'development';
        assert.equal(resolveViewerCountry(req('VN', 'kr')), 'KR');
        process.env.NODE_ENV = 'production';
        assert.equal(resolveViewerCountry(req('VN', 'kr')), 'VN');
    } finally {
        if (previous === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous;
    }
});

test('an exact regional translation wins, then the same language, then the local release title', () => {
    const data = {
        translations: {
            'zh-TW': { title: '神隱少女', overview: '台灣簡介' },
            zh: { title: '千与千寻', overview: '简介' },
            'vi-VN': { title: '', overview: 'Mô tả tiếng Việt' },
            vi: { title: '', overview: 'Mô tả tiếng Việt' },
        },
        alternativeTitles: { VN: 'Vùng Đất Linh Hồn' },
    };
    assert.deepEqual(pickMovieText(data, 'zh-TW'), { title: '神隱少女', overview: '台灣簡介' });
    assert.deepEqual(pickMovieText(data, 'zh-HK'), { title: '千与千寻', overview: '简介' });
    // No translated title, but the film was released in Vietnam under a local title.
    assert.deepEqual(pickMovieText(data, 'vi-VN'), { title: 'Vùng Đất Linh Hồn', overview: 'Mô tả tiếng Việt' });
    assert.deepEqual(pickMovieText(data, 'ja-JP'), { title: '', overview: '' });
});

test('title and synopsis change; genres stay, and gaps or failed lookups keep English', async () => {
    const localized = await localizeMovieText(movies, 'vi-VN', {
        loadTranslations: async (movieId) => {
            if (movieId === '2') throw Object.assign(new Error('TMDB down'), { code: 'TMDB_UNAVAILABLE' });
            return { translations: { vi: { title: 'Vùng Đất Linh Hồn', overview: '' } }, alternativeTitles: {} };
        },
    });
    assert.equal(localized[0].title, 'Vùng Đất Linh Hồn');
    assert.equal(localized[0].overview, 'English synopsis', 'an empty translated synopsis keeps English');
    assert.deepEqual(localized[0].genres, movies[0].genres);
    assert.equal(localized[1].title, 'Parasite');
    assert.equal(localized[1].overview, 'Another');
    assert.equal(movies[0].title, 'Spirited Away', 'the input is not mutated');
});

test('English viewers cost no lookups, and order is preserved', async () => {
    let lookups = 0;
    const english = await localizeMovieText(movies, 'en-US', { loadTranslations: async () => { lookups += 1; return {}; } });
    assert.equal(english, movies);
    assert.equal(lookups, 0);

    const many = Array.from({ length: 9 }, (_, index) => ({ id: String(index + 1), title: `Movie ${index + 1}` }));
    const localized = await localizeMovieText(many, 'ja-JP', {
        loadTranslations: async (movieId) => {
            await new Promise((resolve) => setTimeout(resolve, 10 - Number(movieId)));
            return { translations: { ja: { title: `映画 ${movieId}`, overview: '' } } };
        },
    });
    assert.deepEqual(localized.map((movie) => movie.title), many.map((movie) => `映画 ${movie.id}`));
});
