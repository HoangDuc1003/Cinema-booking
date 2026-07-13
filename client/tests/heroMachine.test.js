import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HERO_FAILURE_REASONS,
  HERO_PHASES,
  createInitialHeroState,
  getPlaybackRemaining,
  hasAdvancedPlayback,
  hasReachedHysteresis,
  heroReducer,
  isExpectedPlayback,
} from '../src/components/hero/heroMachine.js';

const requestTrailer = (state, generation = state.generation + 1) => heroReducer(state, {
  type: 'TRAILER_REQUESTED',
  generation,
  movieKey: state.movieKey,
});

test('stale generations cannot update a newer Hero attempt', () => {
  const initial = createInitialHeroState({ movieKey: 'movie-a' });
  const requested = requestTrailer(initial, 4);
  const stale = heroReducer(requested, {
    type: 'TRAILER_FAILED',
    generation: 3,
    reason: HERO_FAILURE_REASONS.TIMEOUT,
    now: 100,
  });

  assert.strictEqual(stale, requested);
  assert.equal(stale.phase, HERO_PHASES.TRAILER_LOADING);
});

test('repeated PLAYING does not restart the playback clock', () => {
  let state = requestTrailer(createInitialHeroState({ movieKey: 'movie-a' }), 1);
  state = heroReducer(state, { type: 'PLAYBACK_RESUMED', generation: 1, now: 100 });
  state = heroReducer(state, { type: 'PLAYBACK_STABLE', generation: 1, now: 350 });
  state = heroReducer(state, { type: 'PLAYBACK_STABLE', generation: 1, now: 350 });

  assert.equal(state.playbackStartedAt, 100);
  assert.equal(state.phase, HERO_PHASES.TRAILER_ENTERING);
  assert.equal(state.posterVisible, true);
});

test('poster remains visible until visual readiness is confirmed for the current generation', () => {
  let state = requestTrailer(createInitialHeroState({ movieKey: 'movie-a' }), 4);
  state = heroReducer(state, { type: 'PLAYBACK_STABLE', generation: 4, now: 250 });

  assert.equal(state.phase, HERO_PHASES.TRAILER_ENTERING);
  assert.equal(state.posterVisible, true);

  const stale = heroReducer(state, { type: 'VISUAL_READY', generation: 3 });
  assert.strictEqual(stale, state);

  state = heroReducer(state, { type: 'VISUAL_READY', generation: 4 });
  assert.equal(state.posterVisible, false);

  state = heroReducer(state, { type: 'VISUAL_HIDDEN', generation: 4 });
  assert.equal(state.posterVisible, true);
});

test('the 250ms playing hysteresis is included in the 3000ms playback budget', () => {
  let state = requestTrailer(createInitialHeroState({ movieKey: 'movie-a' }), 1);
  state = heroReducer(state, { type: 'PLAYBACK_RESUMED', generation: 1, now: 1_000 });
  state = heroReducer(state, { type: 'PLAYBACK_STABLE', generation: 1, now: 1_250 });

  assert.equal(state.playbackStartedAt, 1_000);
  assert.equal(getPlaybackRemaining(state, 3_999).compactRemainingMs, 1);
  assert.equal(getPlaybackRemaining(state, 4_000).compactRemainingMs, 0);
});

test('compact budget accumulates exactly 3000ms across pause and resume', () => {
  let state = requestTrailer(createInitialHeroState({ movieKey: 'movie-a' }), 1);
  state = heroReducer(state, { type: 'PLAYBACK_STABLE', generation: 1, now: 100 });
  state = heroReducer(state, { type: 'PLAYBACK_PAUSED', generation: 1, now: 600 });

  assert.equal(state.compactRemainingMs, 2_500);
  assert.equal(state.previewRemainingMs, 19_500);
  assert.equal(state.playbackStartedAt, null);

  state = heroReducer(state, { type: 'PLAYBACK_STABLE', generation: 1, now: 1_000 });
  assert.deepEqual(getPlaybackRemaining(state, 3_499), {
    compactRemainingMs: 1,
    previewRemainingMs: 17_001,
  });

  state = heroReducer(state, { type: 'COMPACT_ELAPSED', generation: 1, now: 3_500 });
  assert.equal(state.compactRemainingMs, 0);
  assert.equal(state.previewRemainingMs, 17_000);
  assert.equal(state.phase, HERO_PHASES.TRAILER_COMPACT);
  assert.equal(state.hasCompacted, true);
});

test('buffer and playing hysteresis thresholds are inclusive only at the threshold', () => {
  assert.equal(hasReachedHysteresis(449, 450), false);
  assert.equal(hasReachedHysteresis(450, 450), true);
  assert.equal(hasReachedHysteresis(249, 250), false);
  assert.equal(hasReachedHysteresis(250, 250), true);
});

test('visual readiness requires PLAYING state and advancing current time', () => {
  const validProbe = {
    playerState: 1,
    playingState: 1,
    previousTime: 8.25,
    currentTime: 8.6,
  };

  assert.equal(hasAdvancedPlayback(validProbe), true);
  assert.equal(hasAdvancedPlayback({ ...validProbe, playerState: 2 }), false);
  assert.equal(hasAdvancedPlayback({ ...validProbe, currentTime: 8.25 }), false);
  assert.equal(hasAdvancedPlayback({ ...validProbe, currentTime: Number.NaN }), false);
});

test('playback confirmation checks generation, state, and expected start time', () => {
  const valid = {
    eventGeneration: 7,
    currentGeneration: 7,
    playerState: 1,
    playingState: 1,
    currentTime: 12.4,
    startSeconds: 12,
  };

  assert.equal(isExpectedPlayback(valid), true);
  assert.equal(isExpectedPlayback({ ...valid, eventGeneration: 6 }), false);
  assert.equal(isExpectedPlayback({ ...valid, playerState: 3 }), false);
  assert.equal(isExpectedPlayback({ ...valid, currentTime: 18 }), false);
});

test('all required failure reasons preserve the reason and stop playback', () => {
  for (const reason of Object.values(HERO_FAILURE_REASONS)) {
    let state = requestTrailer(createInitialHeroState({ movieKey: reason }), 2);
    state = heroReducer(state, { type: 'PLAYBACK_STABLE', generation: 2, now: 10 });
    state = heroReducer(state, {
      type: 'TRAILER_FAILED',
      generation: 2,
      reason,
      detail: { marker: reason },
      now: 210,
    });

    assert.equal(state.phase, HERO_PHASES.TRAILER_FAILED);
    assert.equal(state.failureReason, reason);
    assert.equal(state.failureDetail.marker, reason);
    assert.equal(state.posterVisible, true);
    assert.equal(state.playbackStartedAt, null);
  }
});

test('manual retry and movie/resize/poster resets create clean generations', () => {
  let state = requestTrailer(createInitialHeroState({ movieKey: 'movie-a' }), 2);
  state = heroReducer(state, {
    type: 'TRAILER_FAILED',
    generation: 2,
    reason: HERO_FAILURE_REASONS.AUTOPLAY_BLOCKED,
    retryCount: 0,
    now: 0,
  });
  state = heroReducer(state, {
    type: 'TRAILER_REQUESTED',
    generation: 3,
    movieKey: 'movie-a',
    retryCount: 1,
  });
  assert.equal(state.retryCount, 1);
  assert.equal(state.failureReason, null);

  state = heroReducer(state, { type: 'MOVIE_CHANGED', generation: 4, movieKey: 'movie-b' });
  assert.deepEqual(state, createInitialHeroState({ movieKey: 'movie-b', generation: 4 }));

  state = heroReducer(requestTrailer(state, 5), { type: 'BELOW_LG', generation: 6, movieKey: 'movie-b' });
  assert.deepEqual(state, createInitialHeroState({ movieKey: 'movie-b', generation: 6 }));

  state = heroReducer(requestTrailer(state, 7), { type: 'POSTER_REQUESTED', generation: 8, movieKey: 'movie-b' });
  assert.deepEqual(state, createInitialHeroState({ movieKey: 'movie-b', generation: 8 }));
});

test('compact overview can reveal and hide without leaving the compact phase', () => {
  let state = requestTrailer(createInitialHeroState({ movieKey: 'movie-a' }), 1);
  state = heroReducer(state, { type: 'PLAYBACK_STABLE', generation: 1, now: 0 });
  state = heroReducer(state, { type: 'COMPACT_ELAPSED', generation: 1, now: 3_000 });
  assert.equal(state.overviewRevealed, false);

  state = heroReducer(state, { type: 'REVEAL_OVERVIEW', generation: 1 });
  assert.equal(state.overviewRevealed, true);
  assert.equal(state.phase, HERO_PHASES.TRAILER_COMPACT);

  state = heroReducer(state, { type: 'HIDE_OVERVIEW', generation: 1 });
  assert.equal(state.overviewRevealed, false);
  assert.equal(state.phase, HERO_PHASES.TRAILER_COMPACT);
});
