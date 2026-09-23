import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('the Hero trailer is a chrome-free, muted, lazily loaded native video', async () => {
  const source = await read('../src/components/hero/HeroTrailerVideo.jsx');
  // The last <video occurrence is the element itself; the first is in the doc comment.
  const tagStart = source.lastIndexOf('<video');
  const videoTag = source.slice(tagStart, source.indexOf('/>', tagStart));

  // No `controls` attribute means the browser never draws a play button or bar.
  assert.doesNotMatch(videoTag, /\bcontrols\b/);
  assert.match(videoTag, /muted=\{muted\}/);
  assert.match(videoTag, /playsInline/);
  assert.match(videoTag, /preload="none"/);
  assert.match(videoTag, /aria-hidden="true"/);
  // Nothing downloads until the slide has been on screen for the start delay.
  assert.match(source, /START_DELAY_MS = 1_600/);
  assert.match(videoTag, /src=\{started \? src : undefined\}/);
  // It only fades in once a frame is really painted, and gives up after a timeout.
  assert.match(source, /requestVideoFrameCallback\(markReady\)/);
  assert.match(source, /READY_TIMEOUT_MS/);
  // Unmounting detaches the source so the download stops immediately.
  assert.match(source, /video\.removeAttribute\('src'\);\s*video\.load\(\);/);
});

test('HeroSection only plays trailers where they are worth the cost', async () => {
  const source = await read('../src/components/HeroSection.jsx');

  assert.match(source, /trailersAllowed = !isMobileScreen && !reducedMotion && !saveData && !slowNetwork/);
  assert.match(source, /playing=\{inView && pageVisible && !isTransitioning\}/);
  // A trailer slide advances when the trailer ends, not on the poster timer.
  assert.match(source, /reducedMotion \|\| movies\.length < 2 \|\| activeTrailer/);
  assert.match(source, /onFinish=\{\(\) => switchMovie\(currentIndex \+ 1\)\}/);
  // A trailer that fails is not retried, and the slide falls back to its poster.
  assert.match(source, /onFail=\{\(\) => markTrailerFailed\(activeTrailer\.src\)\}/);
  assert.match(source, /muted=\{!soundOn\}/);
});

test('a trailer that goes away never leaves the Hero in trailer mode or skips a picked slide', async () => {
  const source = await read('../src/components/hero/HeroTrailerVideo.jsx');
  const cleanupStart = source.indexOf('useEffect(() => () => {');
  const cleanup = source.slice(cleanupStart, source.indexOf('}, []);', cleanupStart));

  // Unmounting for any reason (slide change, resize to mobile, failure) reports it.
  assert.match(cleanup, /onVisibleChange\?\.\(false\)/);
  // The delayed end-of-trailer advance is cancelled with the component.
  assert.match(cleanup, /window\.clearTimeout\(finishTimerRef\.current\)/);
  assert.match(source, /finishTimerRef\.current = window\.setTimeout/);
});

test('a browser that refuses sound keeps the trailer playing muted', async () => {
  const [video, hero] = await Promise.all([
    read('../src/components/hero/HeroTrailerVideo.jsx'),
    read('../src/components/HeroSection.jsx'),
  ]);
  assert.match(video, /error\?\.name === 'NotAllowedError' && !video\.muted/);
  assert.match(video, /video\.muted = true;\s*handlersRef\.current\.onSoundBlocked\?\.\(\);/);
  assert.match(hero, /onSoundBlocked=\{\(\) => setSoundOn\(false\)\}/);
});
