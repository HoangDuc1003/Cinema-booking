import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getClientHeroDayKey,
    millisecondsUntilNextLocalMidnight,
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

test('reloads during the same local day keep the same Hero slice', () => {
    const morning = new Date(2026, 6, 22, 0, 1);
    const evening = new Date(2026, 6, 22, 23, 59);

    assert.equal(getClientHeroDayKey(morning), '2026-07-22');
    assert.equal(resolveClientHeroOffset(morning), resolveClientHeroOffset(evening));
});

test('crossing local midnight advances exactly one Hero slice', () => {
    const beforeMidnight = new Date(2026, 6, 22, 23, 59, 59, 999);
    const afterMidnight = new Date(2026, 6, 23, 0, 0, 0, 0);

    assert.equal(
        resolveClientHeroOffset(afterMidnight),
        (resolveClientHeroOffset(beforeMidnight) + 1) % 30,
    );
});

test('millisecondsUntilNextLocalMidnight uses the device-local calendar', () => {
    const now = new Date(2026, 6, 22, 23, 59, 59, 500);
    assert.equal(millisecondsUntilNextLocalMidnight(now), 500);
});

test('Hero cache hydrates only current-day server movies', () => {
    const store = setupMockSessionStorage();
    const movies = [{ id: 42, title: 'Server title', backdrop_path: '/server.jpg' }];
    try {
        store.set(HERO_CACHE_KEY, JSON.stringify({
            version: HERO_CACHE_VERSION,
            source: 'server',
            dayKey: '2026-07-22',
            movies,
        }));
        assert.deepEqual(getInitialHeroMovies('2026-07-22'), movies);

        assert.deepEqual(getInitialHeroMovies('2026-07-23'), []);
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
            dayKey: '2026-07-22',
            movies: [{ id: 1, title: 'Mock title' }],
        }));

        assert.deepEqual(getInitialHeroMovies('2026-07-22'), []);
        assert.equal(store.has(HERO_CACHE_KEY), false);
    } finally {
        delete globalThis.window;
    }
});
