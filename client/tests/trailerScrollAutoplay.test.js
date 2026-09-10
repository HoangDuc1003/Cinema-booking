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

test('the Hero offers a Trailer button beside Book Now that jumps to the trailer', async () => {
  const [content, section] = await Promise.all([
    read('../src/components/hero/HeroContent.jsx'),
    read('../src/components/HeroSection.jsx'),
  ]);

  assert.match(content, /hero-action--trailer/);
  assert.match(content, /<span>Trailer<\/span>/);
  // It sits between Book Now and Details.
  assert.ok(
    content.indexOf('hero-action--primary') < content.indexOf('hero-action--trailer'),
    'Trailer must come after Book Now',
  );
  assert.match(section, /scrollToTrailer\(\{ reducedMotion \}\)/);
  assert.match(section, /onTrailer=\{showTrailer\}/);
});

test('the trailer jump centres its target and never scrolls past a tall one', async () => {
  const source = await read('../src/lib/scrollToTrailer.js');

  assert.match(source, /window\.innerHeight - rect\.height\) \/ 2/);
  // An element taller than the viewport aligns to the top instead of centring.
  assert.match(source, /Math\.max\(0, \(window\.innerHeight - rect\.height\) \/ 2\)/);
  assert.match(source, /Math\.max\(0, window\.scrollY \+ rect\.top - spare\)/);
  // The section mounts lazily, so the player is re-centred once it appears.
  assert.match(source, /TARGET_SELECTORS = \['\.trailer-player', '#home-trailer-section', '#trailers'\]/);
  assert.match(source, /requestAnimationFrame\(settle\)/);
  assert.match(source, /reducedMotion \? 'auto' : 'smooth'/);
});

test('the movie poster grows downward on hover so the artwork is never cropped at the top', async () => {
  const css = await read('../src/index.css');

  const posterRule = css.slice(css.indexOf('.movie-card__poster {'));
  assert.match(posterRule.slice(0, 600), /transform-origin: top center;/);
  // The card still clips, which is exactly why the origin has to be the top edge.
  assert.match(css, /\.movie-card \{[\s\S]*?overflow: hidden;/);
});
