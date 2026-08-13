import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Home mounts the YouTube TrailerSection independently of the native Hero player', async () => {
  const [home, trailer, nativeVideo] = await Promise.all([
    read('../src/pages/Home.jsx'),
    read('../src/components/TrailerSection.jsx'),
    read('../src/components/hero/HeroNativeVideo.jsx'),
  ]);

  assert.match(home, /import\('\.\.\/components\/TrailerSection'\)/);
  assert.match(home, /<TrailerSection sectionId="home-trailer-section"/);
  assert.doesNotMatch(home, /<NativeTrailerSection/);
  assert.match(trailer, /youtube-nocookie\.com\/embed/);
  assert.match(trailer, /<iframe/);
  assert.doesNotMatch(trailer, /resolveConfiguredHeroVideoSource|HeroMediaAsset|<video/);
  assert.match(nativeVideo, /<video/);
  assert.doesNotMatch(nativeVideo, /iframe|youtube-nocookie/i);
});

test('TrailerSection uses one batch lookup and validates the YouTube key before embedding', async () => {
  const [section, service] = await Promise.all([
    read('../src/components/TrailerSection.jsx'),
    read('../src/services/tmdb.js'),
  ]);

  assert.match(section, /fetchHomeTrailers/);
  assert.match(section, /MAX_TRAILER_CANDIDATES = 10/);
  assert.doesNotMatch(section, /fetchMovieTrailers|fetchLatestTrailers|\/videos\b/);
  assert.match(service, /method:\s*'POST'/);
  assert.match(service, /JSON\.stringify\(\{ movieIds: ids \}\)/);
  assert.match(service, /YOUTUBE_KEY_PATTERN/);
  assert.match(service, /provider === 'youtube'/);
  assert.match(service, /youtube-nocookie\.com\/embed/);
});
