import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Home renders Hero directly without a timeout or hidden readiness gate', async () => {
    const source = await read('../src/pages/Home.jsx');
    assert.match(source, /<HeroSection autoPreview\s*\/>/);
    assert.doesNotMatch(source, /setTimeout|timedOut|onDataLoaded|className=\{.*hidden/);
});

test('Hero has no legacy poster warmup contract', async () => {
    const source = await read('../src/components/HeroSection.jsx');
    assert.doesNotMatch(source, /posterWarmupMs|posterWarmupComplete|introComplete|onDataLoaded/);
});

test('Home Hero and Now Showing do not use client session caches that can cross a slot boundary', async () => {
    const source = await read('../src/services/tmdb.js');
    assert.doesNotMatch(source, /HERO_CACHE_KEY|HOME_NOW_SHOWING_CACHE_KEY/);
});

test('Trailer candidate loading resolves only the active and immediate next movie', async () => {
    const source = await read('../src/components/TrailerSection.jsx');
    assert.match(source, /fetchLatestTrailers/);
    assert.match(source, /const nextIndex = \(currentIndex \+ 1\) % trailers\.length/);
    assert.doesNotMatch(source, /Promise\.all\(.*fetchMovieTrailers/s);
});
