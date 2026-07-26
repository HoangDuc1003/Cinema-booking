import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getClientHeroDayKey,
    millisecondsUntilNextHeroRotation,
    resolveClientHeroOffset,
} from '../src/services/heroCatalogOffset.js';
import {
    HERO_CACHE_KEY,
    HERO_CACHE_VERSION,
    getInitialHeroMovies,
} from '../src/components/hero/heroCatalogLoader.js';

const setupMockSessionStorage = () => {
    const store = new Map();
    globalThis.window = {
        sessionStorage: {
            getItem: (key) => store.get(key) || null,
            setItem: (key, value) => store.set(key, String(value)),
            removeItem: (key) => store.delete(key),
        },
    };
    return store;
};

test('reloads during the same 48-hour window keep the same Hero slice', () => {
    const earlyTime = new Date(1784700000000);
    const sameWindowTime = new Date(1784700000000 + 3600000);

    assert.equal(getClientHeroDayKey(earlyTime), getClientHeroDayKey(sameWindowTime));
    assert.equal(resolveClientHeroOffset(earlyTime), resolveClientHeroOffset(sameWindowTime));
});

test('crossing 48-hour period advances the Hero slice', () => {
    const periodMs = 48 * 60 * 60 * 1000;
    const endOfPeriod = new Date(periodMs - 1);
    const startOfNextPeriod = new Date(periodMs + 1);

    assert.equal(
        resolveClientHeroOffset(startOfNextPeriod),
        (resolveClientHeroOffset(endOfPeriod) + 1) % 30,
    );
});

test('millisecondsUntilNextHeroRotation targets rotation end boundary', () => {
    const periodMs = 48 * 60 * 60 * 1000;
    const nearBoundary = new Date(periodMs - 500);
    assert.equal(millisecondsUntilNextHeroRotation(nearBoundary), 500);
});

test('Hero cache hydrates only current half-day server movies', () => {
    const store = setupMockSessionStorage();
    const movies = [{ id: 42, title: 'Server title', backdrop_path: '/server.jpg' }];
    try {
        store.set(HERO_CACHE_KEY, JSON.stringify({
            version: HERO_CACHE_VERSION,
            source: 'server',
            dayKey: '2026-07-22-AM',
            movies,
        }));
        assert.deepEqual(getInitialHeroMovies('2026-07-22-AM'), movies);

        // Different half-day key should miss
        assert.deepEqual(getInitialHeroMovies('2026-07-22-PM'), []);
        assert.equal(store.has(HERO_CACHE_KEY), false);
    } finally {
        delete globalThis.window;
    }
});

test('Hero cache rejects fallback sources', () => {
    const store = setupMockSessionStorage();
    try {
        store.set(HERO_CACHE_KEY, JSON.stringify({
            version: HERO_CACHE_VERSION,
            source: 'fallback',
            dayKey: '2026-07-22-AM',
            movies: [{ id: 1, title: 'Mock title' }],
        }));

        assert.deepEqual(getInitialHeroMovies('2026-07-22-AM'), []);
        assert.equal(store.has(HERO_CACHE_KEY), false);
    } finally {
        delete globalThis.window;
    }
});
