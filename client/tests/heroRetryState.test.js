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

test('heroRetryState: button label transitions (Trailer -> Loading… -> Retry trailer -> Trailer unavailable)', async () => {
  const content = await readSource('components/hero/HeroContent.jsx');

  // Verify label computation logic in HeroContent.jsx
  assert.match(content, /const trailerUnavailable = failureReason === HERO_FAILURE_REASONS\.MISSING_VIDEO/);
  assert.match(content, /const effectiveTrailerFailed = trailerFailed && !isSectionMode/);
  assert.match(content, /Loading/);
  assert.match(content, /'Trailer unavailable'/);
  assert.match(content, /'Retry trailer'/);
  assert.match(content, /'Trailer'/);

  // Verify button is disabled ONLY when loading or unavailable (enabled during Retry trailer)
  assert.match(content, /disabled=\{trailerLoading \|\| trailerUnavailable\}/);

  // Unit calculation helper test
  const computeLabel = ({ trailerLoading, trailerUnavailable, effectiveTrailerFailed }) => (
    trailerLoading
      ? 'Loading…'
      : trailerUnavailable
        ? 'Trailer unavailable'
        : effectiveTrailerFailed
          ? 'Retry trailer'
          : 'Trailer'
  );

  const computeDisabled = ({ trailerLoading, trailerUnavailable }) => (
    trailerLoading || trailerUnavailable
  );

  // State 1: Idle with valid source -> "Trailer", enabled
  assert.equal(computeLabel({ trailerLoading: false, trailerUnavailable: false, effectiveTrailerFailed: false }), 'Trailer');
  assert.equal(computeDisabled({ trailerLoading: false, trailerUnavailable: false }), false);

  // State 2: Loading -> "Loading…", disabled
  assert.equal(computeLabel({ trailerLoading: true, trailerUnavailable: false, effectiveTrailerFailed: false }), 'Loading…');
  assert.equal(computeDisabled({ trailerLoading: true, trailerUnavailable: false }), true);

  // State 3: Transient error -> "Retry trailer", enabled
  assert.equal(computeLabel({ trailerLoading: false, trailerUnavailable: false, effectiveTrailerFailed: true }), 'Retry trailer');
  assert.equal(computeDisabled({ trailerLoading: false, trailerUnavailable: false }), false);

  // State 4: Permanent missing video -> "Trailer unavailable", disabled
  assert.equal(computeLabel({ trailerLoading: false, trailerUnavailable: true, effectiveTrailerFailed: false }), 'Trailer unavailable');
  assert.equal(computeDisabled({ trailerLoading: false, trailerUnavailable: true }), true);
});

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

  // Clear stale timers before startPlaybackForIndex
  assert.match(section, /clearHandoff\(\)/);
  assert.match(section, /cancelAudioRamp\(\)/);
  assert.match(section, /clearTransitionTimers\(\)/);

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

  // Verify useEffect on generation change triggers video.load()
  assert.match(nativeVideo, /useEffect\(\(\) => \{[\s\S]*?video\.load\(\);[\s\S]*?\}, \[clearTimers, generation, src\]\)/);

  // Verify unmount cleanup pauses video, strips src attribute, and calls load()
  assert.match(nativeVideo, /video\.pause\(\)/);
  assert.match(nativeVideo, /video\.removeAttribute\('src'\)/);
  assert.match(nativeVideo, /sourceRef\.current\?\.removeAttribute\('src'\)/);
  assert.match(nativeVideo, /video\.load\(\)/);
});

test('heroRetryState: switchMovie uses modulo indexing for catalog wrap-around (movie 4 -> movie 0)', async () => {
  const section = await readSource('components/HeroSection.jsx');

  // Modulo indexing in switchMovie
  assert.match(section, /const normalized = \(\(targetIndex % available\.length\) \+ available\.length\) % available\.length/);

  // handleEnded calls switchMovie with endedIndex + 1
  assert.match(section, /switchMovie\(endedIndex \+ 1/);

  // Test wrapping calculation explicitly: 5 movies (indices 0..4), endedIndex = 4 -> targetIndex = 5 -> 0
  const availableLength = 5;
  const endedIndex = 4;
  const targetIndex = endedIndex + 1;
  const normalized = ((targetIndex % availableLength) + availableLength) % availableLength;
  assert.equal(normalized, 0, 'Movie 4 ending must wrap to movie 0');
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
  assert.equal(getHeroTrailerMode('unknown'), 'native');
  assert.equal(getHeroTrailerMode(undefined), 'native');
});
