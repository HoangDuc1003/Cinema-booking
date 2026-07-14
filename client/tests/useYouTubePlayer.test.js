import assert from 'node:assert/strict';
import test from 'node:test';

import {
  disableCaptionsBestEffort,
  getSafePlayerVars,
  LOCKED_YOUTUBE_PLAYER_VARS,
} from '../src/hooks/useYouTubePlayer.js';

test('YouTube player invariants cannot be overridden by callers', () => {
  const playerVars = getSafePlayerVars({
    autoplay: 1,
    controls: 1,
    disablekb: 0,
    fs: 1,
    iv_load_policy: 1,
    playsinline: 0,
    rel: 1,
    enablejsapi: 0,
    cc_load_policy: 1,
    cc_lang_pref: 'vi',
    color: 'white',
  });

  assert.deepEqual(
    Object.fromEntries(Object.keys(LOCKED_YOUTUBE_PLAYER_VARS).map((key) => [key, playerVars[key]])),
    LOCKED_YOUTUBE_PLAYER_VARS,
  );
  assert.equal(playerVars.cc_lang_pref, undefined);
  assert.equal(playerVars.color, 'white');
});

test('caption shutdown clears the active track when the module is available', () => {
  const calls = [];
  const player = {
    getOptions: () => ['captions', 'other-module'],
    setOption: (...args) => calls.push(args),
  };

  disableCaptionsBestEffort(player);

  assert.deepEqual(calls, [['captions', 'track', {}]]);
});

test('caption shutdown never interrupts playback when YouTube rejects the command', () => {
  const player = {
    getOptions: () => ['captions'],
    setOption: () => {
      throw new Error('unsupported player version');
    },
  };

  assert.doesNotThrow(() => disableCaptionsBestEffort(player));
  assert.doesNotThrow(() => disableCaptionsBestEffort(null));
});
