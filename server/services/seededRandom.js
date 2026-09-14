// FNV-1a: a stable 32-bit hash, so the same key always seeds the same draw.
export const hashSeed = (value) => {
    let hash = 0x811c9dc5;
    for (const char of String(value)) {
        hash ^= char.codePointAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

// mulberry32: tiny seeded PRNG, good enough to scatter mock schedules and posters.
export const seededRandom = (seed) => {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};
