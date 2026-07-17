import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveClientHeroOffset } from '../src/services/heroCatalogOffset.js';

const setupMockLocalStorage = () => {
    const store = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (key) => store.get(key) || null,
            setItem: (key, value) => store.set(key, String(value)),
            removeItem: (key) => store.delete(key),
        },
    };
    return store;
};

test('resolveClientHeroOffset advances offset every 5 page reloads', () => {
    const store = setupMockLocalStorage();
    try {
        const offset1 = resolveClientHeroOffset();
        assert.equal(offset1, 0);
        assert.equal(store.get('nitrocine:hero-reload-count'), '1');

        resolveClientHeroOffset(); // 2
        resolveClientHeroOffset(); // 3
        resolveClientHeroOffset(); // 4
        const offset5 = resolveClientHeroOffset(); // 5
        assert.equal(offset5, 1);
        assert.equal(store.get('nitrocine:hero-reload-count'), '5');
        assert.equal(store.get('nitrocine:hero-slice-offset'), '1');
    } finally {
        delete globalThis.window;
    }
});

test('resolveClientHeroOffset advances offset when calendar day changes', () => {
    const store = setupMockLocalStorage();
    try {
        store.set('nitrocine:hero-day', '2025-01-01');
        store.set('nitrocine:hero-slice-offset', '3');
        store.set('nitrocine:hero-reload-count', '2');

        const offset = resolveClientHeroOffset();
        assert.equal(offset, 4);
        assert.equal(store.get('nitrocine:hero-slice-offset'), '4');
        assert.equal(store.get('nitrocine:hero-reload-count'), '3');
    } finally {
        delete globalThis.window;
    }
});
