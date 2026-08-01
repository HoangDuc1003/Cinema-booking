import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HOME_NOW_SHOWING_CACHE_KEY,
  HOME_NOW_SHOWING_MAX_STALE_MS,
  HOME_NOW_SHOWING_CACHE_SCHEMA_VERSION,
  HOME_NOW_SHOWING_FRESH_TTL_MS,
  readHomeNowShowingCache,
  saveHomeNowShowingCache,
} from '../src/services/homeNowShowingCache.js';

const movies = [{
  id: '100',
  _id: '100',
  title: 'Server Movie',
  poster_path: '/server-movie.jpg',
}];

const setupStorage = () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  };
  return values;
};

test('home cache stores only server payloads and distinguishes fresh from stale data', () => {
  const values = setupStorage();
  try {
    assert.equal(saveHomeNowShowingCache({ movies, meta: { version: 4 }, source: 'server' }), true);
    const stored = JSON.parse(values.get(HOME_NOW_SHOWING_CACHE_KEY));
    assert.equal(stored.schemaVersion, HOME_NOW_SHOWING_CACHE_SCHEMA_VERSION);
    assert.equal(stored.source, 'server');

    const savedAt = Date.parse(stored.savedAt);
    assert.equal(readHomeNowShowingCache(savedAt + HOME_NOW_SHOWING_FRESH_TTL_MS - 1).fresh, true);
    assert.equal(readHomeNowShowingCache(savedAt + HOME_NOW_SHOWING_FRESH_TTL_MS + 1).fresh, false);
    assert.deepEqual(readHomeNowShowingCache(savedAt + HOME_NOW_SHOWING_FRESH_TTL_MS + 1).movies, movies);

    assert.equal(saveHomeNowShowingCache({ movies, source: 'development-mock' }), false);
    assert.equal(JSON.parse(values.get(HOME_NOW_SHOWING_CACHE_KEY)).source, 'server');
  } finally {
    delete globalThis.window;
  }
});

test('home cache removes corrupt and expired payloads without throwing', () => {
  const values = setupStorage();
  try {
    values.set(HOME_NOW_SHOWING_CACHE_KEY, '{broken');
    assert.equal(readHomeNowShowingCache(), null);
    assert.equal(values.has(HOME_NOW_SHOWING_CACHE_KEY), false);

    values.set(HOME_NOW_SHOWING_CACHE_KEY, JSON.stringify({
      schemaVersion: HOME_NOW_SHOWING_CACHE_SCHEMA_VERSION,
      source: 'server',
      savedAt: new Date(Date.now() - HOME_NOW_SHOWING_MAX_STALE_MS - 1).toISOString(),
      movies,
    }));
    assert.equal(readHomeNowShowingCache(), null);
    assert.equal(values.has(HOME_NOW_SHOWING_CACHE_KEY), false);
  } finally {
    delete globalThis.window;
  }
});
