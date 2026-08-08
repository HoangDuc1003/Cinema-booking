import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Home always mounts the deferred Native Trailer section independently of trailer mode', async () => {
  const source = await read('../src/pages/Home.jsx');

  assert.match(source, /anchorId="trailers"/);
  assert.match(source, /<NativeTrailerSection sectionId="home-trailer-section"/);
  assert.doesNotMatch(source, /showTrailerSection\s*&&/);
});

test('Native Trailer section keeps an observable heading and fallback when both sources fail', async () => {
  const source = await read('../src/components/NativeTrailerSection.jsx');

  assert.match(source, />Trailers<\/h2>/);
  assert.match(source, /Trailer previews are temporarily unavailable/);
  assert.match(source, /Native video trailer preview unavailable\. Showing poster fallback/);
  assert.doesNotMatch(source, /if \(hasError \|\| trailers\.length === 0\) return null/);
});

test('HeroSection consumes the provider-owned Hero payload instead of issuing its own request', async () => {
  const heroSource = await read('../src/components/HeroSection.jsx');
  const providerSource = await read('../src/context/HomeDataContext.jsx');

  assert.match(heroSource, /useHomeData/);
  assert.doesNotMatch(heroSource, /fetchHomeHero/);
  assert.match(providerSource, /fetchHomeHero/);
  assert.match(providerSource, /fetchHomeNowShowing/);
});

test('deterministic 503 responses do not trigger a second retry attempt', async () => {
  const source = await read('../src/services/tmdb.js');

  assert.match(source, /\[408, 429, 500, 502, 504\]\.includes\(error\.status\)/);
  assert.doesNotMatch(source, /\[408, 429, 500, 502, 503, 504\]/);
});

test('Admin UI exposes the protected Now Showing sync action', async () => {
  const source = await read('../src/pages/admin/HeroSettings.jsx');

  assert.match(source, /apiClient\.post\('\/api\/show\/sync-now-playing'\)/);
  assert.match(source, /Sync Now Showing/);
});
