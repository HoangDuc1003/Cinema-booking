import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getHeroTrailerMode } from '../src/components/hero/heroTrailerMode.js';

const readSource = (relativePath) => readFile(
  new URL(`../src/${relativePath}`, import.meta.url),
  'utf8',
);

test('getHeroTrailerMode helper logic handles all environment flag values', () => {
  assert.equal(getHeroTrailerMode('native'), 'native');
  assert.equal(getHeroTrailerMode('section'), 'section');
  assert.equal(getHeroTrailerMode('hybrid'), 'hybrid');
  assert.equal(getHeroTrailerMode(' NATIVE '), 'native');
  assert.equal(getHeroTrailerMode('SECTION'), 'section');
  assert.equal(getHeroTrailerMode(undefined), 'native');
  assert.equal(getHeroTrailerMode(''), 'native');
  assert.equal(getHeroTrailerMode('unknown'), 'native');
});

test('R3 & R4: HeroSection handleTrailerAction retries native playback via videoGeneration instead of scrolling', async () => {
  const section = await readSource('components/HeroSection.jsx');

  // Verify retryNonce is NOT used (consolidated into videoGeneration via nextGeneration)
  assert.doesNotMatch(section, /retryNonceRef/);
  assert.doesNotMatch(section, /setRetryNonce/);

  // Verify retry clears error state and failed key
  assert.match(section, /failedMovieKeysRef\.current\.delete\(key\)/);
  assert.match(section, /setPlaybackStatus\(HERO_PLAYBACK_STATUS\.IDLE\)/);
  assert.match(section, /setFailureReason\(null\)/);

  // Verify handleTrailerAction respects mode and retry
  assert.match(section, /if\s*\(trailerMode\s*===\s*'section'\)\s*\{\s*scrollToTrailerSection\(\);/);
  assert.match(section, /if\s*\(trailerMode\s*===\s*'native'\)\s*\{\s*handlePlayTrailer\(\);/);
  assert.match(section, /if\s*\(trailerAvailable\)\s*\{\s*handlePlayTrailer\(\);/);
});

test('R4: section mode disables native playback and passes mode to HeroContent', async () => {
  const [section, content] = await Promise.all([
    readSource('components/HeroSection.jsx'),
    readSource('components/hero/HeroContent.jsx'),
  ]);

  // Section mode disables startPlaybackForIndex
  assert.match(section, /if\s*\(trailerMode\s*===\s*'section'\)\s*return false;/);

  // HeroContent receives trailerMode and suppresses Retry trailer in section mode
  assert.match(section, /trailerMode=\{trailerMode\}/);
  assert.match(content, /const isSectionMode = trailerMode === 'section';/);
  assert.match(content, /const effectiveTrailerFailed = trailerFailed && !isSectionMode;/);
});

test('R3: HeroNativeVideo triggers video.load() on generation change for retry re-initialization', async () => {
  const nativeVideo = await readSource('components/hero/HeroNativeVideo.jsx');

  // Verify video.load() is called in the generation/src effect
  assert.match(nativeVideo, /video\.load\(\)/);
});
