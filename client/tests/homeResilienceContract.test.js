import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Home always mounts a deferred Trailer section with an observable unavailable state', async () => {
  const [home, trailer] = await Promise.all([
    read('../src/pages/Home.jsx'),
    read('../src/components/TrailerSection.jsx'),
  ]);

  assert.match(home, /anchorId="trailers"/);
  assert.match(home, /<TrailerSection sectionId="home-trailer-section"/);
  assert.doesNotMatch(home, /showTrailerSection\s*&&/);
  assert.match(trailer, />\s*Trailers\s*</);
  assert.match(trailer, /Trailer unavailable for this movie/);
  assert.match(trailer, /Trailer candidates are temporarily unavailable/);
  assert.doesNotMatch(trailer, /Native video trailer preview unavailable/);
});

test('Hero and Now Showing own independent provider effects, errors, and retry functions', async () => {
  const [heroSource, providerSource, featureSource] = await Promise.all([
    read('../src/components/HeroSection.jsx'),
    read('../src/context/HomeDataContext.jsx'),
    read('../src/components/FeatureSection.jsx'),
  ]);

  assert.match(providerSource, /heroError/);
  assert.match(providerSource, /nowShowingError/);
  assert.match(providerSource, /retryHero/);
  assert.match(providerSource, /retryNowShowing/);
  assert.equal((providerSource.match(/useEffect\(\(\) =>/g) || []).length >= 2, true);
  assert.match(heroSource, /retryHero:\s*retryHomeData/);
  assert.match(featureSource, /retryNowShowing/);
});

test('deterministic 503 responses do not trigger a second client retry attempt', async () => {
  const source = await read('../src/services/tmdb.js');

  assert.match(source, /\[408, 429, 500, 502, 504\]\.includes\(error\.status\)/);
  assert.doesNotMatch(source, /\[408, 429, 500, 502, 503, 504\]/);
});

test('Home discovery cards route to details instead of promising an unverified booking', async () => {
  const source = await read('../src/components/FeatureSection.jsx');
  assert.match(source, /View Details/);
  assert.match(source, /ctaLabel="View details"/);
  assert.doesNotMatch(source, />\s*Book Now\s*</);
});
