import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readSource = (relativePath) => readFile(
  new URL(`../src/${relativePath}`, import.meta.url),
  'utf8',
);

test('the Hero render path is native-only and never imports YouTube or TMDB video lookup code', async () => {
  const [section, renderer, nativeVideo] = await Promise.all([
    readSource('components/HeroSection.jsx'),
    readSource('components/hero/HeroVideoRenderer.jsx'),
    readSource('components/hero/HeroNativeVideo.jsx'),
  ]);
  const heroPath = `${section}\n${renderer}\n${nativeVideo}`;

  assert.doesNotMatch(heroPath, /HeroYouTubeVideo|useYouTubePlayer|ReactPlayer/);
  assert.doesNotMatch(heroPath, /getTmdbMovieVideos|\/videos\b|youtube\.com|youtube-nocookie/);
  assert.doesNotMatch(renderer, /iframe|youtube/i);
  assert.match(renderer, /HeroNativeVideo/);
  assert.match(nativeVideo, /<video/);
  assert.match(nativeVideo, /currentTime/);
});

test('native Hero markup disables controls, picture-in-picture, remote playback, and pointer input', async () => {
  const nativeVideo = await readSource('components/hero/HeroNativeVideo.jsx');

  assert.match(nativeVideo, /\bautoPlay\b/);
  assert.match(nativeVideo, /\bplaysInline\b/);
  assert.match(nativeVideo, /preload="metadata"/);
  assert.match(nativeVideo, /disablePictureInPicture/);
  assert.match(nativeVideo, /disableRemotePlayback/);
  assert.match(nativeVideo, /controls=\{false\}/);
  assert.match(nativeVideo, /nodownload noplaybackrate noremoteplayback/);
  assert.match(nativeVideo, /pointerEvents:\s*'none'/);
  assert.doesNotMatch(nativeVideo, />\s*Pause\s*</i);
});

test('the non-Hero TrailerSection keeps its YouTube parser outside the Hero directory', async () => {
  const trailerSection = await readSource('components/TrailerSection.jsx');
  assert.match(trailerSection, /lib\/youtubeVideo/);
});

test('Hero audio cleanup settles a pending ramp and keeps global gestures off the sound control', async () => {
  const [section, content] = await Promise.all([
    readSource('components/HeroSection.jsx'),
    readSource('components/hero/HeroContent.jsx'),
  ]);
  const cancelStart = section.indexOf('const cancelAudioRamp');
  const cancelEnd = section.indexOf('const nextGeneration', cancelStart);
  const cancellation = section.slice(cancelStart, cancelEnd);

  assert.match(cancellation, /audioRampResolveRef\.current\?\.\(false\)/);
  assert.doesNotMatch(cancellation, /audioRampResolveRef\.current\s*=\s*null/);
  assert.match(section, /closest\('\[data-hero-sound-control\]'\)/);
  assert.match(content, /data-hero-sound-control/);
});

test('missing native Hero trailers keep a lower-trailer action instead of showing an error state', async () => {
  const content = await readSource('components/hero/HeroContent.jsx');

  assert.match(content, /const trailerUnavailable = failureReason === HERO_FAILURE_REASONS\.MISSING_VIDEO/);
  assert.match(content, /trailerUnavailable \|\| trailerFailed/);
  assert.match(content, /View trailer below/);
  assert.match(content, /const showTrailerButton = !trailerActive/);
  assert.doesNotMatch(content, /Use Play trailer to try again/);
});
