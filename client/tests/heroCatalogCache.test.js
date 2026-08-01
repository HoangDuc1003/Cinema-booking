import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HERO_CACHE_KEY,
  HERO_CACHE_MAX_AGE_MS,
  HERO_CACHE_VERSION,
  getInitialHeroPayload,
  saveHeroMoviesCache,
} from '../src/components/hero/heroCatalogLoader.js';

const setupLocalStorage = () => {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  };
  return store;
};

const movies = Array.from({ length: 5 }, (_, index) => ({
  id: String(42 + index),
  title: `Server title ${index}`,
  backdrop_path: `/server-${index}.jpg`,
  heroVideoStatus: 'ready',
  heroVideoUrl: `https://cdn.test/server-${index}.mp4`,
  heroVideoMimeType: 'video/mp4',
  heroVideoVersion: 2,
}));

test('Hero cache admits only fresh server-authoritative payloads and preserves their order', () => {
  const store = setupLocalStorage();
  const now = Date.now();
  try {
    const saved = saveHeroMoviesCache(movies, {
      source: 'server',
      meta: {
        batchId: 'batch-2',
        version: 2,
        nextRefreshAt: '2026-08-01T17:00:00.000Z',
        timezone: 'Asia/Ho_Chi_Minh',
      },
      settings: {
        heroSoundDefaultEnabled: true,
        heroDefaultVolume: 0.35,
      },
    });
    assert.equal(saved, true);

    const payload = getInitialHeroPayload();
    assert.deepEqual(payload.movies, movies);
    assert.equal(payload.meta.batchId, 'batch-2');
    assert.equal(payload.meta.version, '2');
    assert.equal(payload.meta.timezone, 'Asia/Ho_Chi_Minh');
    assert.equal(payload.settings.heroDefaultVolume, 0.35);

    const fallbackSaved = saveHeroMoviesCache(movies, {
      source: 'server',
      meta: {
        batchId: null,
        version: 0,
        nextRefreshAt: '2026-08-02T17:00:00.000Z',
        timezone: 'Asia/Ho_Chi_Minh',
      },
    });
    assert.equal(fallbackSaved, true);
    assert.equal(getInitialHeroPayload().meta.version, '0');

    const invalidPayloads = [
      { schemaVersion: HERO_CACHE_VERSION, source: 'fallback', cachedAt: new Date(now).toISOString(), movies },
      { schemaVersion: HERO_CACHE_VERSION, source: 'server', cachedAt: new Date(now).toISOString(), movies: [movies[0], movies[0]] },
      { schemaVersion: HERO_CACHE_VERSION, source: 'server', cachedAt: new Date(now).toISOString(), movies: [...movies, { id: '99' }] },
      { schemaVersion: HERO_CACHE_VERSION, source: 'server', cachedAt: new Date(now - HERO_CACHE_MAX_AGE_MS - 1).toISOString(), movies },
    ];
    for (const payload of invalidPayloads) {
      store.set(HERO_CACHE_KEY, JSON.stringify(payload));
      assert.equal(getInitialHeroPayload(now), null);
      assert.equal(store.has(HERO_CACHE_KEY), false);
    }
    store.set(HERO_CACHE_KEY, '{not-json');
    assert.equal(getInitialHeroPayload(now), null);
    assert.equal(store.has(HERO_CACHE_KEY), false);

    assert.equal(saveHeroMoviesCache(movies, { source: 'fallback' }), false);
    assert.equal(saveHeroMoviesCache(movies, { source: 'server' }), false);
    assert.equal(store.has(HERO_CACHE_KEY), false);
    assert.equal(saveHeroMoviesCache([movies[0], movies[0]], { source: 'server' }), false);
    assert.equal(store.has(HERO_CACHE_KEY), false);
    assert.equal(saveHeroMoviesCache([], { source: 'server' }), false);
  } finally {
    delete globalThis.window;
  }
});
