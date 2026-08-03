import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createInitialHeroState,
  heroReducer,
  HERO_PLAYBACK_STATUS,
  HERO_FAILURE_REASONS,
  HERO_PHASES,
} from '../src/components/hero/heroMachine.js';
import { getHeroTrailerMode } from '../src/components/hero/heroTrailerMode.js';

const readSource = (relativePath) => readFile(
  new URL(`../src/${relativePath}`, import.meta.url),
  'utf8',
);

test('heroRetryState: videoGeneration resets error states and increments generation counter', async () => {
  const section = await readSource('components/HeroSection.jsx');

  // Verify videoGeneration state & ref initialization
  assert.match(section, /\[videoGeneration,\s*setVideoGeneration\]\s*=\s*useState\(0\)/);
  assert.match(section, /generationRef\s*=\s*useRef\(0\)/);

  // Verify nextGeneration increments generationRef and updates videoGeneration
  assert.match(section, /generationRef\.current\s*\+=\s*1/);
  assert.match(section, /setVideoGeneration\(generationRef\.current\)/);

  // Verify keying forces re-render on videoGeneration change
  assert.match(section, /key=\{`hero-native-\${videoGeneration}-/);
});

test('heroRetryState: handlePlayTrailer clears failed keys, resets error state, and retries via videoGeneration without scroll', async () => {
  const section = await readSource('components/HeroSection.jsx');

  // Clear failed movie key
  assert.match(section, /failedMovieKeysRef\.current\.delete\(key\)/);

  // Verify retryNonce is NOT used (consolidated into videoGeneration via nextGeneration)
  assert.doesNotMatch(section, /retryNonceRef/);
  assert.doesNotMatch(section, /setRetryNonce/);

  // Reset playback status to IDLE and failure reason to null
  assert.match(section, /setPlaybackStatus\(HERO_PLAYBACK_STATUS\.IDLE\)/);
  assert.match(section, /setFailureReason\(null\)/);

  // Trigger manual playback without scrolling or altering index
  assert.match(section, /startPlaybackForIndex\(currentIndex,\s*\{\s*intent:\s*PLAYBACK_INTENT\.MANUAL/);
  // Extract handlePlayTrailer function body
  const handlePlayTrailerMatch = section.match(/const handlePlayTrailer = useCallback\([\s\S]*?\);\n/);
  assert.ok(handlePlayTrailerMatch, 'handlePlayTrailer defined');
  const body = handlePlayTrailerMatch[0];

  assert.doesNotMatch(body, /scrollToTrailerSection/);
  assert.doesNotMatch(body, /scrollIntoView/);
  assert.doesNotMatch(body, /navigate\(/);
});

test('heroRetryState: HeroNativeVideo unmount cleanup maintains single active video element constraint', async () => {
  const nativeVideo = await readSource('components/hero/HeroNativeVideo.jsx');

  // Verify unmount cleanup pauses video, strips src attribute, and calls load()
  assert.match(nativeVideo, /video\.pause\(\)/);
  assert.match(nativeVideo, /video\.removeAttribute\('src'\)/);
  assert.match(nativeVideo, /sourceRef\.current\?\.removeAttribute\('src'\)/);
  assert.match(nativeVideo, /video\.load\(\)/);
});

test('heroRetryState: switchMovie uses modulo indexing for catalog wrap-around (last -> first trailer)', async () => {
  const section = await readSource('components/HeroSection.jsx');

  // Modulo indexing in switchMovie
  assert.match(section, /const normalized = \(\(targetIndex % available\.length\) \+ available\.length\) % available\.length/);

  // handleEnded calls switchMovie with endedIndex + 1
  assert.match(section, /switchMovie\(endedIndex \+ 1/);
});

test('heroRetryState: heroMachine reducer transitions from FAILED to TRAILER_REQUESTED cleanly', () => {
  let state = createInitialHeroState({ movieKey: 'movie-1', generation: 1 });
  state = heroReducer(state, {
    type: 'TRAILER_FAILED',
    generation: 1,
    reason: HERO_FAILURE_REASONS.VIDEO_ERROR,
    now: 100,
  });

  assert.equal(state.playbackStatus, HERO_PLAYBACK_STATUS.FAILED);
  assert.equal(state.failureReason, HERO_FAILURE_REASONS.VIDEO_ERROR);
  assert.equal(state.phase, HERO_PHASES.TRAILER_FAILED);

  // Re-requesting trailer with new generation resets failure reason and status
  state = heroReducer(state, {
    type: 'TRAILER_REQUESTED',
    generation: 2,
    movieKey: 'movie-1',
    retryCount: 1,
  });

  assert.equal(state.generation, 2);
  assert.equal(state.playbackStatus, HERO_PLAYBACK_STATUS.IDLE);
  assert.equal(state.failureReason, null);
  assert.equal(state.phase, HERO_PHASES.TRAILER_LOADING);
  assert.equal(state.retryCount, 1);
});

test('heroRetryState: feature flag semantics for native, section, and hybrid modes', () => {
  assert.equal(getHeroTrailerMode('native'), 'native');
  assert.equal(getHeroTrailerMode('section'), 'section');
  assert.equal(getHeroTrailerMode('hybrid'), 'hybrid');
  assert.equal(getHeroTrailerMode('unknown'), 'hybrid');
  assert.equal(getHeroTrailerMode(undefined), 'hybrid');
});
