import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('R1: Home route uses NativeTrailerSection and does not import legacy YouTube TrailerSection', async () => {
  const homeSource = await readFile(
    new URL('../src/pages/Home.jsx', import.meta.url),
    'utf8'
  );

  assert.match(homeSource, /getHeroTrailerMode/);
  assert.match(homeSource, /NativeTrailerSection/);
  assert.doesNotMatch(homeSource, /import\('\.\.\/components\/TrailerSection'\)/);
  assert.doesNotMatch(homeSource, /\bTrailerSection\b/);
  assert.doesNotMatch(homeSource, /youtube|youtu\.be|youtube-nocookie|googlevideo|iframe/i);
  assert.doesNotMatch(homeSource, /fetchMovieTrailers|\/videos\b/i);
  assert.match(homeSource, /<NativeTrailerSection sectionId="home-trailer-section"/);
});

test('R1: NativeTrailerSection has zero YouTube references, zero TMDB videos calls, and zero unverified URL fallbacks', async () => {
  const nativeSectionSource = await readFile(
    new URL('../src/components/NativeTrailerSection.jsx', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(nativeSectionSource, /youtube|youtu\.be|iframe_api/i);
  assert.doesNotMatch(nativeSectionSource, /fetchMovieTrailers|\/videos\b/i);
  assert.doesNotMatch(nativeSectionSource, /<iframe/i);
  assert.match(nativeSectionSource, /<video/i);
  assert.match(nativeSectionSource, /resolveConfiguredHeroVideoSource/);
  assert.doesNotMatch(nativeSectionSource, /background_video_url|videoUrl|trailerUrl/);
});
