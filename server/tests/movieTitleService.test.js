import assert from 'node:assert/strict';
import test from 'node:test';
import {
    languageForCountry,
    localizeMovieTitles,
    pickTitle,
    resolveViewerCountry,
} from '../services/movieTitleService.js';

const movies = [
    { _id: '1', id: '1', title: 'Spirited Away', overview: 'English synopsis', genres: [{ id: 16, name: 'Animation' }] },
    { _id: '2', id: '2', title: 'Parasite', overview: 'Another', genres: [] },
];

test('a country maps to its title language, and unknown countries read English', () => {
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

test('an exact regional title wins, then any title in the same language', () => {
    const titles = { 'zh-TW': '神隱少女', zh: '千与千寻', 'vi-VN': 'Vùng Đất Linh Hồn', vi: 'Vùng Đất Linh Hồn' };
    assert.equal(pickTitle(titles, 'zh-TW'), '神隱少女');
    assert.equal(pickTitle(titles, 'zh-HK'), '千与千寻');
    assert.equal(pickTitle(titles, 'ja-JP'), '');
});

test('only the title changes; missing translations and failed lookups keep English', async () => {
    const localized = await localizeMovieTitles(movies, 'vi-VN', {
        loadTitles: async (movieId) => {
            if (movieId === '2') throw Object.assign(new Error('TMDB down'), { code: 'TMDB_UNAVAILABLE' });
            return { 'vi-VN': 'Vùng Đất Linh Hồn', vi: 'Vùng Đất Linh Hồn' };
        },
    });
    assert.equal(localized[0].title, 'Vùng Đất Linh Hồn');
    assert.equal(localized[0].overview, 'English synopsis');
    assert.deepEqual(localized[0].genres, movies[0].genres);
    assert.equal(localized[1].title, 'Parasite');
    assert.equal(movies[0].title, 'Spirited Away', 'the input is not mutated');
});

test('English viewers cost no lookups, and order is preserved', async () => {
    let lookups = 0;
    const english = await localizeMovieTitles(movies, 'en-US', { loadTitles: async () => { lookups += 1; return {}; } });
    assert.equal(english, movies);
    assert.equal(lookups, 0);

    const many = Array.from({ length: 9 }, (_, index) => ({ id: String(index + 1), title: `Movie ${index + 1}` }));
    const localized = await localizeMovieTitles(many, 'ja-JP', {
        loadTitles: async (movieId) => {
            await new Promise((resolve) => setTimeout(resolve, 10 - Number(movieId)));
            return { ja: `映画 ${movieId}` };
        },
    });
    assert.deepEqual(localized.map((movie) => movie.title), many.map((movie) => `映画 ${movie.id}`));
});
