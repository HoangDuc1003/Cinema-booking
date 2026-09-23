import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Hero admin is limited to selecting and ordering exactly five posters', async () => {
  const source = await read('../src/pages/admin/HeroSettings.jsx');

  assert.match(source, /const MAX_HERO_MOVIES = 5/);
  assert.match(source, /Daily auto/);
  assert.match(source, /Manual five/);
  assert.match(source, /Randomize five/);
  assert.match(source, /Choose exactly \$\{MAX_HERO_MOVIES\} posters for manual mode/);
  assert.doesNotMatch(source, /HeroVideoUploader|HeroVideoReadiness|native trailer|sound settings|hero\/refresh/i);
});

test('Hero preserves the server-provided five-movie order', async () => {
  const source = await read('../src/components/HeroSection.jsx');

  assert.match(source, /validateMovieCandidates\(orderedMovies, controller\.signal\)/);
  assert.match(source, /saveHeroMoviesCache\(preparedMovies,/);
  assert.match(source, /setMovies\(preparedMovies\)/);
  assert.match(source, /data-hero-media=\{trailerVisible \? 'video' : 'poster'\}/);
  assert.doesNotMatch(source, /HeroVideoRenderer|HeroNativeVideo|heroVideoSource|heroTrailerMode|<iframe/);
});
