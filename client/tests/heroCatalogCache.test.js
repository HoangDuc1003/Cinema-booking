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

test('reloads during the same half-day keep the same Hero slice', () => {
    const earlyMorning = new Date(2026, 6, 22, 8, 0);
    const lateMorning = new Date(2026, 6, 22, 11, 59);

    assert.equal(getClientHeroDayKey(earlyMorning), '2026-07-22-AM');
    assert.equal(getClientHeroDayKey(lateMorning), '2026-07-22-AM');
    assert.equal(resolveClientHeroOffset(earlyMorning), resolveClientHeroOffset(lateMorning));
});

test('crossing noon advances the Hero slice', () => {
    const beforeNoon = new Date(2026, 6, 22, 11, 59, 59, 999);
    const afterNoon = new Date(2026, 6, 22, 12, 0, 0, 0);

    assert.equal(getClientHeroDayKey(beforeNoon), '2026-07-22-AM');
    assert.equal(getClientHeroDayKey(afterNoon), '2026-07-22-PM');
    assert.equal(
        resolveClientHeroOffset(afterNoon),
        (resolveClientHeroOffset(beforeNoon) + 1) % 30,
    );
});

test('crossing local midnight advances exactly one Hero slice', () => {
    const beforeMidnight = new Date(2026, 6, 22, 23, 59, 59, 999);
    const afterMidnight = new Date(2026, 6, 23, 0, 0, 0, 0);

    assert.equal(getClientHeroDayKey(beforeMidnight), '2026-07-22-PM');
    assert.equal(getClientHeroDayKey(afterMidnight), '2026-07-23-AM');
    assert.equal(
        resolveClientHeroOffset(afterMidnight),
        (resolveClientHeroOffset(beforeMidnight) + 1) % 30,
    );
});

test('millisecondsUntilNextHeroRotation targets noon from morning', () => {
    const morning = new Date(2026, 6, 22, 11, 59, 59, 500);
    assert.equal(millisecondsUntilNextHeroRotation(morning), 500);
});

test('millisecondsUntilNextHeroRotation targets midnight from evening', () => {
    const evening = new Date(2026, 6, 22, 23, 59, 59, 500);
    assert.equal(millisecondsUntilNextHeroRotation(evening), 500);
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
