import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Home renders Hero directly without a timeout or hidden readiness gate', async () => {
    const source = await read('../src/pages/Home.jsx');
    assert.match(source, /<HeroSection autoPreview onTrailerRequest=\{setRequestedTrailerMovie\} \/>/);
    assert.match(source, /anchorId="trailers"/);
    assert.doesNotMatch(source, /setTimeout|timedOut|onDataLoaded|className=\{.*hidden/);
});

test('Hero has no legacy poster warmup contract', async () => {
    const source = await read('../src/components/HeroSection.jsx');
    assert.doesNotMatch(source, /posterWarmupMs|posterWarmupComplete|introComplete|onDataLoaded/);
});

test('Home Now Showing uses a versioned discovery cache and still revalidates from the server', async () => {
    const [provider, cache] = await Promise.all([
        read('../src/context/HomeDataContext.jsx'),
        read('../src/services/homeNowShowingCache.js'),
    ]);
    assert.match(provider, /readHomeNowShowingCache/);
    assert.match(provider, /fetchHomeNowShowing/);
    assert.match(cache, /home-now-showing-cache-v2/);
    assert.match(cache, /HOME_NOW_SHOWING_CACHE_SCHEMA_VERSION = 2/);
});

test('Trailer candidates come from Now Showing then Hero and resolve in one bounded batch', async () => {
    const [section, service] = await Promise.all([
        read('../src/components/TrailerSection.jsx'),
        read('../src/services/tmdb.js'),
    ]);
    assert.match(section, /\[\.\.\.nowShowingMovies, \.\.\.heroMovies\]/);
    assert.match(section, /MAX_TRAILER_CANDIDATES = 10/);
    assert.match(section, /fetchHomeTrailers/);
    assert.match(service, /home-trailers:/);
    assert.doesNotMatch(section, /fetchMovieTrailers|fetchLatestTrailers/);
});
