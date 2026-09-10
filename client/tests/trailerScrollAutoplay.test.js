import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('the home trailer starts itself when it scrolls into view and stops when it leaves', async () => {
  const source = await read('../src/components/TrailerSection.jsx');

  // Visibility drives playback.
  assert.match(source, /new IntersectionObserver/);
  assert.match(source, /AUTOPLAY_VISIBILITY_RATIO/);
  assert.match(source, /postToPlayer\(inView \? 'playVideo' : 'pauseVideo'\)/);
});

test('trailer autoplay is muted, because browsers block sound-on autoplay outright', async () => {
  const source = await read('../src/components/TrailerSection.jsx');

  assert.match(source, /buildEmbedUrl\(trailerKey, \{ autoplay: false, muted: true \}\)/);
  assert.match(source, /mute: muted \? '1' : '0'/);
});

test('playback and mute are commanded over postMessage instead of rewriting the src', async () => {
  const source = await read('../src/components/TrailerSection.jsx');

  // Rewriting the src would reload the iframe and restart the trailer, so the
  // src must depend on the trailer key alone - never on inView or muted.
  assert.match(source, /\[trailerKey\],\s*\);/);
  assert.doesNotMatch(source, /buildEmbedUrl\([^)]*inView/);
  assert.match(source, /postToPlayer\(muted \? 'mute' : 'unMute'\)/);
  assert.match(source, /enablejsapi: '1'/);
  // postMessage must be targeted at the embed origin, never at '*'.
  assert.match(source, /postMessage\(\s*[\s\S]{0,160}YOUTUBE_ORIGIN,/);
  assert.doesNotMatch(source, /postMessage\([^)]*'\*'/);
});

test('a command is never posted to an iframe that has not loaded yet', async () => {
  const source = await read('../src/components/TrailerSection.jsx');

  assert.match(source, /const frameReady = Boolean\(trailerKey\) && readyTrailerKey === trailerKey;/);
  assert.match(source, /if \(!frameReady \|\| !autoplayAllowed\) return;/);
  assert.match(source, /onLoad=\{\(\) => setReadyTrailerKey\(current\.trailer\.key\)\}/);
});

test('autoplay yields to reduced motion, Save-Data, and hidden tabs', async () => {
  const source = await read('../src/components/TrailerSection.jsx');

  assert.match(source, /const autoplayAllowed = !reducedMotion && !saveData;/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /useSaveData/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /document\.visibilityState !== 'visible'\) postToPlayer\('pauseVideo'\)/);
});

test('the viewer can always take back control of the sound', async () => {
  const source = await read('../src/components/TrailerSection.jsx');

  assert.match(source, /aria-label=\{muted \? 'Unmute trailer' : 'Mute trailer'\}/);
  assert.match(source, /setMuted\(\(current2\) => !current2\)/);
});

test('movie cards reveal individually as the grid scrolls past, and stay visible without an observer', async () => {
  const [grid, hook, css] = await Promise.all([
    read('../src/components/MovieGrid.jsx'),
    read('../src/hooks/useScrollReveal.js'),
    read('../src/index.css'),
  ]);

  // Per card, not once for the whole grid - that is what ties it to the scroll.
  assert.match(grid, /const GridItem = /);
  assert.match(grid, /useScrollReveal\(\)/);
  assert.match(grid, /animated && isRevealed \? ' is-entering' : ''/);

  // One pooled observer rather than one per card.
  assert.match(hook, /const pools = new Map\(\)/);
  assert.match(hook, /observer\.disconnect\(\)/);

  // Without an observer the cards must still be fully visible: the animation is
  // an enhancement, never the thing that makes content appear.
  assert.match(hook, /typeof IntersectionObserver === 'undefined'/);
  assert.match(css, /\.catalog-grid-item \{[^}]*opacity: 1;/);
});
