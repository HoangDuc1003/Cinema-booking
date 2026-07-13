import test from 'node:test';
import assert from 'node:assert/strict';
import {
    fetchTmdbImage,
    normalizeTmdbImagePath,
    normalizeTmdbImageSize,
} from '../services/tmdbImageService.js';

test('TMDB image path normalization accepts only allowlisted image sources', () => {
    assert.equal(normalizeTmdbImagePath('/poster_123.jpg'), '/poster_123.jpg');
    assert.equal(
        normalizeTmdbImagePath('https://image.tmdb.org/t/p/w500/poster_123.jpg'),
        '/poster_123.jpg',
    );
    assert.equal(
        normalizeTmdbImagePath('https://media.themoviedb.org/t/p/original/poster-123.webp'),
        '/poster-123.webp',
    );
    assert.equal(normalizeTmdbImagePath('https://example.com/poster.jpg'), '');
    assert.equal(normalizeTmdbImagePath('file:///etc/passwd'), '');
    assert.equal(normalizeTmdbImagePath('../../etc/passwd'), '');
});

test('TMDB image size normalization rejects arbitrary upstream paths', () => {
    assert.equal(normalizeTmdbImageSize('w780'), 'w780');
    assert.equal(normalizeTmdbImageSize('ORIGINAL'), 'original');
    assert.equal(normalizeTmdbImageSize('w9999'), '');
    assert.equal(normalizeTmdbImageSize('../w780'), '');
});

test('TMDB image loader returns validated binary image data', async () => {
    const fetcher = async (url, options) => {
        assert.equal(url, 'https://image.tmdb.org/t/p/w780/poster.jpg');
        assert.equal(options.responseType, 'arraybuffer');
        return {
            data: Uint8Array.from([1, 2, 3, 4]),
            headers: { 'content-type': 'image/jpeg; charset=binary' },
        };
    };

    const result = await fetchTmdbImage({ path: '/poster.jpg', size: 'w780', fetcher });
    assert.equal(result.contentType, 'image/jpeg');
    assert.deepEqual([...result.body], [1, 2, 3, 4]);
});

test('TMDB image loader rejects a non-image upstream response', async () => {
    const fetcher = async () => ({
        data: Buffer.from('not an image'),
        headers: { 'content-type': 'text/html' },
    });

    await assert.rejects(
        fetchTmdbImage({ path: '/poster.jpg', size: 'w780', fetcher }),
        /non-image/,
    );
});

