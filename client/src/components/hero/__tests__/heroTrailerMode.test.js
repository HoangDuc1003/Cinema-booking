import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getHeroTrailerMode } from '../heroTrailerMode.js';

const readSource = (relativePath) => readFile(
  new URL(`../../${relativePath}`, import.meta.url),
  'utf8',
);

test('getHeroTrailerMode handles all environment flag cases', () => {
  assert.equal(getHeroTrailerMode('native'), 'native');
  assert.equal(getHeroTrailerMode('section'), 'section');
  assert.equal(getHeroTrailerMode('hybrid'), 'hybrid');
  assert.equal(getHeroTrailerMode('   native   '), 'native');
  assert.equal(getHeroTrailerMode(undefined), 'native');
  assert.equal(getHeroTrailerMode(''), 'native');
  assert.equal(getHeroTrailerMode('unknown'), 'native');
});

test('native trailer retry resets error state and replays via videoGeneration without scroll', async () => {
  const section = await readSource('HeroSection.jsx');

  // Verify key deletion on retry
  assert.match(section, /failedMovieKeysRef\.current\.delete\(key\)/);

  // Verify retryNonce is NOT used (consolidated into videoGeneration via nextGeneration)
  assert.doesNotMatch(section, /retryNonceRef/);

  // Verify error state cleared
  assert.match(section, /setPlaybackStatus\(HERO_PLAYBACK_STATUS\.IDLE\)/);
  assert.match(section, /setFailureReason\(null\)/);

  // Verify retry calls startPlaybackForIndex with PLAYBACK_INTENT.MANUAL
  assert.match(section, /intent:\s*PLAYBACK_INTENT\.MANUAL/);
});

test('VITE_HERO_TRAILER_MODE supports native, section, and hybrid semantics', async () => {
  const [section, content] = await Promise.all([
    readSource('HeroSection.jsx'),
    readSource('hero/HeroContent.jsx'),
  ]);

  // 'native' mode: never scrolls to section, calls handlePlayTrailer
  assert.match(section, /if\s*\(trailerMode\s*===\s*'native'\)\s*\{\s*handlePlayTrailer\(\);/);

  // 'section' mode: native player disabled in Hero, scrolls to section
  assert.match(section, /if\s*\(trailerMode\s*===\s*'section'\)\s*return false;/);
  assert.match(section, /if\s*\(trailerMode\s*===\s*'section'\)\s*\{\s*scrollToTrailerSection\(\);/);

  // 'hybrid' mode: tries native playback first when valid native source exists, retries native playback in Hero
  assert.match(section, /if\s*\(trailerAvailable\)\s*\{\s*handlePlayTrailer\(\);/);

  // HeroContent ignores trailerFailed in section mode
  assert.match(content, /const isSectionMode = trailerMode === 'section';/);
  assert.match(content, /const effectiveTrailerFailed = trailerFailed && !isSectionMode;/);
});
