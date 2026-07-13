import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHeroImageCandidates,
  extractTmdbImagePath,
  getTmdbImageProxyUrl,
  getTmdbImageUrl,
} from '../src/components/hero/heroImages.js';

test('Hero image helpers normalize TMDB paths without accepting arbitrary hosts', () => {
  assert.equal(extractTmdbImagePath('/movie.jpg'), '/movie.jpg');
  assert.equal(
    extractTmdbImagePath('https://media.themoviedb.org/t/p/original/movie.jpg'),
    '/movie.jpg',
  );
  assert.equal(extractTmdbImagePath('https://example.com/movie.jpg'), '');
  assert.equal(extractTmdbImagePath('../movie.jpg'), '');
});

test('Hero image candidates try the TMDB CDN then the same API proxy', () => {
  assert.equal(
    getTmdbImageUrl('https://image.tmdb.org/t/p/w500/movie.jpg', 'w780'),
    'https://image.tmdb.org/t/p/w780/movie.jpg',
  );
  assert.equal(
    getTmdbImageProxyUrl('/movie.jpg', 'w780', 'https://api.example.test/'),
    'https://api.example.test/api/show/tmdb/image?path=%2Fmovie.jpg&size=w780',
  );
  assert.deepEqual(
    buildHeroImageCandidates(['/movie.jpg', '/movie.jpg'], 'w780', 'https://api.example.test'),
    [
      'https://image.tmdb.org/t/p/w780/movie.jpg',
      'https://api.example.test/api/show/tmdb/image?path=%2Fmovie.jpg&size=w780',
    ],
  );
});

test('non-TMDB remote images remain usable without being sent through the proxy', () => {
  assert.deepEqual(
    buildHeroImageCandidates('https://cdn.example.test/hero.jpg', 'w1280', 'https://api.example.test'),
    ['https://cdn.example.test/hero.jpg'],
  );
});

