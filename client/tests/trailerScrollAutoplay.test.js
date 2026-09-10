import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('the home trailer starts itself when it scrolls into view and stops when it leaves', async () => {
  const source = await read('../src/components/TrailerSection.jsx');

  assert.match(source, /new IntersectionObserver/);
  assert.match(source, /AUTOPLAY_VISIBILITY_RATIO/);
  assert.match(source, /postToPlayer\(inView \|\| userStarted \? 'playVideo' : 'pauseVideo'\)/);
});

test('the trailer plays with sound, and only drops to muted when the browser refuses', async () => {
  const source = await read('../src/components/TrailerSection.jsx');

  // Sound on by default; only an explicit mute is remembered.
  assert.match(source, /localStorage\.getItem\(SOUND_PREFERENCE_KEY\) !== 'off'/);
  assert.match(source, /useState\(readSoundPreference\)/);
  assert.match(source, /const muted = !soundOn \|\| soundBlocked \|\| \(!userStarted && !hasGesture\);/);

  // A browser that refuses sound-on playback simply never starts, so the player
  // is checked and quietly retried muted rather than left dead on screen.
  assert.match(source, /SOUND_FALLBACK_MS/);
  assert.match(source, /state !== YT_PLAYING && state !== YT_BUFFERING/);
  assert.match(source, /setSoundBlocked\(true\)/);
  assert.match(source, /postToFrame\(\{ event: 'listening', id: sectionId \}\)/);
});

test('sound is gated on a real interaction, tracked as state rather than a ref', async () => {
  const source = await read('../src/components/TrailerSection.jsx');

  assert.match(source, /const \[hasGesture, setHasGesture\] = useState\(false\)/);
  assert.match(source, /addEventListener\('pointerdown', remember/);
  assert.match(source, /addEventListener\('keydown', remember/);
  // Pressing play is itself the gesture the autoplay policy was waiting for.
  assert.match(source, /const startTrailer = \(key\) => \{[\s\S]*?setHasGesture\(true\);/);
});

test('the preview is ours, so YouTube never renders its own poster or play button', async () => {
  const [source, css] = await Promise.all([
    read('../src/components/TrailerSection.jsx'),
    read('../src/index.css'),
  ]);

  // The embed only mounts once playback is actually wanted.
  assert.match(source, /\{active \? \(\s*<iframe/);
  assert.match(source, /className="trailer-preview"/);
  assert.match(source, /trailer-preview__play/);
  assert.match(source, /onClick=\{\(\) => startTrailer\(current\.trailer\.key\)\}/);

  // The play button and the sound toggle share one frosted-glass treatment.
  assert.match(css, /\.trailer-glass-button,\s*\.trailer-preview__play \{/);
  assert.match(css, /backdrop-filter: blur\(16px\) saturate\(140%\)/);
  assert.match(source, /className="trailer-glass-button absolute bottom-4 right-4 z-10"/);
});

test('the centring transform on the play button survives reduced motion', async () => {
  const css = await read('../src/index.css');

  const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  // Blanket `transform: none` would knock the play button out of the middle.
  assert.doesNotMatch(reduced.slice(0, reduced.indexOf('.trailer-preview__play')), /trailer-preview__play/);
  assert.match(reduced, /\.trailer-preview__play \{\s*animation: none !important;\s*transition: none !important;\s*\}/);
});

test('playback and mute are commanded over postMessage instead of rewriting the src', async () => {
  const source = await read('../src/components/TrailerSection.jsx');

  // The src depends only on whether the player is active and which trailer it
  // is; rewriting it on every scroll or mute would restart the video.
  assert.match(source, /\[active, trailerKey\],/);
  assert.doesNotMatch(source, /buildEmbedUrl\([^)]*inView/);
  assert.match(source, /postToPlayer\(muted \? 'mute' : 'unMute'\)/);
  assert.match(source, /enablejsapi: '1'/);
  // postMessage must be targeted at the embed origin, never at '*'.
  assert.match(source, /postMessage\(JSON\.stringify\(payload\), YOUTUBE_ORIGIN\)/);
  assert.doesNotMatch(source, /postMessage\([^)]*'\*'/);
  // Messages from any other origin are ignored.
  assert.match(source, /if \(event\.origin !== YOUTUBE_ORIGIN\) return;/);
});

test('a command is never posted to an iframe that has not loaded yet', async () => {
  const source = await read('../src/components/TrailerSection.jsx');

  assert.match(source, /const frameReady = Boolean\(trailerKey\) && readyTrailerKey === trailerKey;/);
  assert.match(source, /if \(!frameReady\) return;/);
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
  assert.match(source, /onClick=\{toggleSound\}/);
  assert.match(source, /writeSoundPreference\(next\)/);
});

test('picking a card from the rail opens that trailer straight away', async () => {
  const source = await read('../src/components/TrailerSection.jsx');

  assert.match(source, /selectMovie\(item\.movieId, item\.trailer\?\.available \? item\.trailer\.key : ''\)/);
  // A rail click is an explicit gesture, so that trailer may start with sound.
  assert.match(source, /if \(key\) startTrailer\(key\);\s*else setStartedKey\(''\);/);
});

test('the Hero Trailer button opens the movie it is showing, not whatever was selected', async () => {
  const [content, section, home] = await Promise.all([
    read('../src/components/hero/HeroContent.jsx'),
    read('../src/components/HeroSection.jsx'),
    read('../src/pages/Home.jsx'),
  ]);

  assert.match(content, /hero-action--trailer/);
  assert.match(content, /<span>Trailer<\/span>/);
  assert.ok(
    content.indexOf('hero-action--primary') < content.indexOf('hero-action--trailer'),
    'Trailer must come after Book Now',
  );

  assert.match(section, /const HeroSection = \(\{ onTrailerRequest \}\) => \{/);
  assert.match(section, /onTrailerRequest\?\.\(currentMovie\)/);
  assert.match(section, /scrollToTrailer\(\{ reducedMotion \}\)/);

  // Home routes that movie into the Trailer section as its featured movie.
  assert.match(home, /onTrailerRequest=\{setRequestedTrailerMovie\}/);
  assert.match(home, /featuredMovie=\{requestedTrailerMovie\}/);
});

test('the trailer jump centres its target and never scrolls past a tall one', async () => {
  const source = await read('../src/lib/scrollToTrailer.js');

  assert.match(source, /Math\.max\(0, \(window\.innerHeight - rect\.height\) \/ 2\)/);
  assert.match(source, /Math\.max\(0, window\.scrollY \+ rect\.top - spare\)/);
  assert.match(source, /TARGET_SELECTORS = \['\.trailer-player', '#home-trailer-section', '#trailers'\]/);
  assert.match(source, /requestAnimationFrame\(settle\)/);
  assert.match(source, /reducedMotion \? 'auto' : 'smooth'/);
});

test('movie cards reveal individually as the grid scrolls past, and stay visible without an observer', async () => {
  const [grid, hook, css] = await Promise.all([
    read('../src/components/MovieGrid.jsx'),
    read('../src/hooks/useScrollReveal.js'),
    read('../src/index.css'),
  ]);

  assert.match(grid, /const GridItem = /);
  assert.match(grid, /useScrollReveal\(\)/);
  assert.match(grid, /animated && isRevealed \? ' is-entering' : ''/);
  assert.match(hook, /const pools = new Map\(\)/);
  assert.match(hook, /observer\.disconnect\(\)/);
  assert.match(hook, /typeof IntersectionObserver === 'undefined'/);
  assert.match(css, /\.catalog-grid-item \{[^}]*opacity: 1;/);
});

test('the movie poster grows downward on hover so the artwork is never cropped at the top', async () => {
  const css = await read('../src/index.css');

  const posterRule = css.slice(css.indexOf('.movie-card__poster {'));
  assert.match(posterRule.slice(0, 600), /transform-origin: top center;/);
  assert.match(css, /\.movie-card \{[\s\S]*?overflow: hidden;/);
});
