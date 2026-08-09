import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createTmdbTrailerService,
    normalizeSelectedTrailer,
    selectBestTmdbTrailer,
} from '../services/tmdbTrailerService.js';

const video = (overrides = {}) => ({
    site: 'YouTube',
    type: 'Trailer',
    official: false,
    key: 'abcdefghijk',
    name: 'Trailer',
    iso_639_1: 'en',
    published_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

test('official YouTube Trailer outranks language preference and all teaser fallbacks', () => {
    const selected = selectBestTmdbTrailer([
        video({ key: 'viTrailer01', iso_639_1: 'vi' }),
        video({ key: 'officialEn1', official: true, iso_639_1: 'en' }),
        video({ key: 'officialTsr', type: 'Teaser', official: true, iso_639_1: 'vi' }),
    ]);
    assert.equal(selected.key, 'officialEn1');
});

test('language preference breaks ties within the same structured trailer class', () => {
    const selected = selectBestTmdbTrailer([
        video({ key: 'englishKey1', official: true, iso_639_1: 'en' }),
        video({ key: 'vietnamKey1', official: true, iso_639_1: 'vi' }),
    ]);
    assert.equal(selected.key, 'vietnamKey1');
});

test('Trailer falls back to Teaser and ignores non-YouTube or malformed candidates', () => {
    const selected = selectBestTmdbTrailer([
        video({ site: 'Vimeo', key: 'vimeoKey001' }),
        video({ key: 'short', official: true }),
        video({ key: 'teaserKey01', type: 'Teaser', official: false }),
    ]);
    assert.equal(selected.key, 'teaserKey01');
});

test('normalized trailer exposes only a validated provider key and privacy-aware URLs', () => {
    const normalized = normalizeSelectedTrailer('123', video({ official: true }));
    assert.deepEqual(normalized, {
        movieId: '123',
        available: true,
        provider: 'youtube',
        key: 'abcdefghijk',
        type: 'Trailer',
        official: true,
        name: 'Trailer',
        publishedAt: '2026-01-01T00:00:00.000Z',
        language: 'en',
        embedUrl: 'https://www.youtube-nocookie.com/embed/abcdefghijk',
        thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
    });
    assert.doesNotMatch(JSON.stringify(normalized), /TMDB_API_KEY|Bearer|api_key/i);
});

test('genuine no-video response is negatively cached and reused without a second TMDB call', async () => {
    const cache = new Map();
    const writes = [];
    let fetches = 0;
    const service = createTmdbTrailerService({
        fetchJson: async () => { fetches += 1; return { results: [] }; },
        readCache: async (key) => cache.get(key) ?? null,
        writeCache: async (key, value, ttl) => { cache.set(key, value); writes.push({ key, ttl }); },
    });

    const first = await service.getMovieTrailer('123');
    const second = await service.getMovieTrailer('123');

    assert.equal(first.status, 'unavailable');
    assert.equal(first.available, false);
    assert.equal(second.cache, 'hit');
    assert.equal(fetches, 1);
    assert.equal(writes.length, 1);
    assert.ok(writes[0].ttl > 0);
});

test('batch lookup preserves input order and isolates one upstream failure', async () => {
    const service = createTmdbTrailerService({
        fetchJson: async (path) => {
            if (path.includes('/2/')) throw new Error('one lookup failed');
            return { results: [video({ key: path.includes('/1/') ? 'movieOne001' : 'movieThree1' })] };
        },
        readCache: async () => null,
        writeCache: async () => true,
        concurrency: 2,
    });

    const result = await service.getTrailers({ movieIds: ['1', '2', '3'] });

    assert.deepEqual(result.results.map((entry) => entry.movieId), ['1', '2', '3']);
    assert.deepEqual(result.results.map((entry) => entry.status), ['available', 'error', 'available']);
    assert.deepEqual(result.meta, { requested: 3, available: 2, unavailable: 0, failed: 1 });
});
