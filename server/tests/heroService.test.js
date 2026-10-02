import test from 'node:test';
import assert from 'node:assert/strict';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import SiteConfig from '../models/SiteConfig.js';
import {
    createHeroEtag,
    getAdminHomeHero,
    getHeroRotationKey,
    getHeroSeed,
    getPublicHomeHero,
    matchesHeroEtag,
    normalizeHeroMovie,
    selectHeroMovies,
    updateHomeHero,
} from '../services/heroService.js';

const SLOT_MS = 12 * 60 * 60 * 1000;
// 09:00 in Vietnam on 2026-03-10, the morning slot.
const NOW = new Date('2026-03-10T02:00:00.000Z');
const slotAfter = (slots, from = NOW) => new Date(from.getTime() + (slots * SLOT_MS));

const chain = (value) => ({
    select: () => chain(value),
    populate: () => chain(value),
    sort: () => chain(value),
    limit: () => chain(value),
    lean: async () => value,
});

// A catalog mixing this year's releases with old films. Lower numbers are more
// popular, so the newest titles would win any "hottest first" pool.
const buildMovie = (index) => ({
    _id: `movie-${index}`,
    title: `Movie ${index}`,
    overview: `Overview ${index}`,
    poster_path: `/movie-${index}.jpg`,
    backdrop_path: `/movie-${index}-backdrop.jpg`,
    release_date: index % 3 === 0 ? '1994-09-23' : '2026-02-20',
    vote_average: 7.5,
    vote_count: 3000,
    popularity: 1000 - index,
    runtime: 120,
    genres: [{ id: 28, name: 'Action' }],
});

const catalogOf = (size) => Array.from({ length: size }, (_, index) => buildMovie(index + 1));
const poolOf = (size) => Array.from({ length: size }, (_, index) => ({ id: `movie-${index + 1}` }));
const ids = (movies) => movies.map((movie) => movie.id);

const withStubs = async ({
    catalog = catalogOf(40),
    config = null,
    onUpdate,
}, run) => {
    const originals = {
        movieFind: Movie.find,
        showFind: Show.find,
        configFindOne: SiteConfig.findOne,
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
    };
    Movie.find = (filter = {}) => {
        const wanted = filter?._id?.$in;
        if (wanted) {
            const set = new Set(wanted.map(String));
            return chain(catalog.filter((movie) => set.has(String(movie._id))));
        }
        return chain(catalog);
    };
    Show.find = () => chain([]);
    SiteConfig.findOne = () => chain(config);
    SiteConfig.findOneAndUpdate = (...args) => {
        onUpdate?.(...args);
        return chain(config);
    };
    try {
        return await run();
    } finally {
        Movie.find = originals.movieFind;
        Show.find = originals.showFind;
        SiteConfig.findOne = originals.configFindOne;
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
    }
};

test('the Hero is poster-only and never projects a video field', () => {
    const normalized = normalizeHeroMovie({
        ...buildMovie(1),
        heroVideoUrl: 'https://res.cloudinary.com/demo/video/upload/x.mp4',
        heroVideoStatus: 'ready',
        heroVideoMimeType: 'video/mp4',
    });
    for (const key of Object.keys(normalized)) {
        assert.ok(!key.toLowerCase().includes('video'), `unexpected video field: ${key}`);
    }
    assert.equal(normalized.id, 'movie-1');
});

test('list entries with genre IDs only still get genre names', () => {
    const normalized = normalizeHeroMovie({ id: 1288445, title: 'Mutiny', genre_ids: [28, 53], poster_path: '/x.jpg' });
    assert.deepEqual(normalized.genres.map((genre) => genre.name), ['Action', 'Thriller']);
    assert.equal(normalized.runtime, null, 'a missing runtime is not reported as zero');
});

test('slots start at 00:00 and 12:00 Vietnam time', () => {
    // 04:59 UTC is 11:59 in Vietnam, 05:00 UTC is noon, 17:00 UTC is midnight.
    assert.equal(getHeroRotationKey(new Date('2026-03-09T17:00:00Z')), '2026-03-10T00:00');
    assert.equal(getHeroRotationKey(new Date('2026-03-10T04:59:00Z')), '2026-03-10T00:00');
    assert.equal(getHeroRotationKey(new Date('2026-03-10T05:00:00Z')), '2026-03-10T12:00');
    assert.equal(getHeroRotationKey(new Date('2026-03-10T16:59:00Z')), '2026-03-10T12:00');
    assert.equal(getHeroRotationKey(new Date('2026-03-10T17:00:00Z')), '2026-03-11T00:00');
    assert.equal(getHeroSeed({ now: NOW }), getHeroSeed({ now: new Date('2026-03-10T04:59:00Z') }));
    assert.notEqual(getHeroSeed({ now: NOW }), getHeroSeed({ now: new Date('2026-03-10T05:00:00Z') }));
    assert.equal(getHeroSeed({ now: NOW, salt: 'abc' }), 'hero:2026-03-10T00:00:abc');
});

test('a slot is five different movies from the pool', () => {
    const picked = selectHeroMovies(poolOf(40), { now: NOW });
    assert.equal(picked.length, 5);
    assert.equal(new Set(ids(picked)).size, 5);
});

test('one slot keeps the same line-up from start to end', () => {
    const pool = poolOf(40);
    assert.deepEqual(
        ids(selectHeroMovies(pool, { now: new Date('2026-03-10T05:00:00Z') })),
        ids(selectHeroMovies(pool, { now: new Date('2026-03-10T16:59:00Z') })),
    );
});

test('every slot changes all five movies from the one before', () => {
    const pool = poolOf(40);
    for (let slot = 0; slot < 20; slot += 1) {
        const current = ids(selectHeroMovies(pool, { now: slotAfter(slot) }));
        const next = new Set(ids(selectHeroMovies(pool, { now: slotAfter(slot + 1) })));
        assert.ok(current.every((id) => !next.has(id)), `slot ${slot} shares a poster with the next one`);
    }
});

test('every movie in the catalog takes its turn before any comes back', () => {
    const pool = poolOf(23);
    const shown = [];
    for (let slot = 0; slot < 4; slot += 1) shown.push(...ids(selectHeroMovies(pool, { now: slotAfter(slot) })));
    assert.equal(new Set(shown).size, 20, 'four slots show twenty different movies');
    shown.push(...ids(selectHeroMovies(pool, { now: slotAfter(4) })));
    assert.deepEqual([...new Set(shown)].sort(), ids(pool).sort(), 'five slots reach every movie');
});

test('selection does not depend on the order the pool arrived in', () => {
    const pool = poolOf(40);
    assert.deepEqual(
        ids(selectHeroMovies(pool, { now: NOW })),
        ids(selectHeroMovies([...pool].reverse(), { now: NOW })),
    );
});

test('an admin salt reshuffles the slot without waiting for the turnover', () => {
    const pool = poolOf(40);
    assert.notDeepEqual(
        ids(selectHeroMovies(pool, { now: NOW })),
        ids(selectHeroMovies(pool, { now: NOW, salt: 'admin-randomized' })),
    );
});

test('auto mode serves five catalog movies, most popular first, with the 12-hour metadata', async () => {
    await withStubs({}, async () => {
        const payload = await getPublicHomeHero({ now: NOW });
        assert.equal(payload.movies.length, 5);
        assert.equal(new Set(ids(payload.movies)).size, 5);
        assert.deepEqual(
            [...ids(payload.movies)].sort(),
            ids(selectHeroMovies(poolOf(40), { now: NOW })).sort(),
        );
        const popularity = payload.movies.map((movie) => movie.popularity);
        assert.deepEqual(popularity, [...popularity].sort((left, right) => right - left));
        assert.equal(payload.settings.effectiveMode, 'auto');
        assert.equal(payload.meta.source, 'poster-rotation');
        assert.equal(payload.meta.rotationHours, 12);
        assert.equal(payload.dateKey, '2026-03-10');
        assert.equal(payload.rotationKey, '2026-03-10T00:00');
        assert.equal(payload.rotation.type, 'poster-rotation');
        assert.equal(payload.rotation.startsAt, '2026-03-09T17:00:00.000Z');
        // 09:00 in Vietnam, so the next line-up is due at noon.
        assert.equal(payload.nextRefreshAt, '2026-03-10T05:00:00.000Z');
        assert.equal(payload.rotation.endsAt, payload.nextRefreshAt);
        assert.equal('personalized' in payload, false, 'one line-up for everyone');
    });
});

test('the afternoon slot turns over at Vietnam midnight', async () => {
    await withStubs({}, async () => {
        const payload = await getPublicHomeHero({ now: new Date('2026-03-10T06:00:00Z') });
        assert.equal(payload.rotationKey, '2026-03-10T12:00');
        assert.equal(payload.nextRefreshAt, '2026-03-10T17:00:00.000Z');
    });
});

test('the rotation walks the whole catalog, not just the newest releases', async () => {
    await withStubs({ catalog: catalogOf(40) }, async () => {
        const shown = new Set();
        for (let slot = 0; slot < 8; slot += 1) {
            const payload = await getPublicHomeHero({ now: slotAfter(slot) });
            ids(payload.movies).forEach((id) => shown.add(id));
        }
        assert.equal(shown.size, 40, 'four days of slots show all forty movies');
    });
});

test('manual mode is authoritative and preserves the saved order', async () => {
    const movieIds = ['movie-9', 'movie-3', 'movie-7', 'movie-1', 'movie-5'];
    await withStubs({
        config: { homeHero: { mode: 'manual', movieIds }, updatedAt: new Date('2026-03-01T00:00:00Z') },
    }, async () => {
        const payload = await getPublicHomeHero({ now: NOW });
        assert.equal(payload.settings.effectiveMode, 'manual');
        assert.equal(payload.meta.source, 'manual-selection');
        assert.deepEqual(ids(payload.movies), movieIds);
    });
});

test('manual mode falls back to the rotation when a saved movie disappears', async () => {
    await withStubs({
        config: {
            homeHero: { mode: 'manual', movieIds: ['movie-1', 'movie-2', 'gone-1', 'gone-2', 'gone-3'] },
            updatedAt: new Date('2026-03-01T00:00:00Z'),
        },
    }, async () => {
        const payload = await getPublicHomeHero({ now: NOW });
        assert.equal(payload.movies.length, 5);
        assert.equal(payload.settings.effectiveMode, 'auto');
        assert.equal(payload.meta.source, 'poster-rotation');
    });
});

test('a catalog that cannot fill five slots is a 503, never a short Hero', async () => {
    await withStubs({ catalog: catalogOf(3) }, async () => {
        await assert.rejects(
            () => getPublicHomeHero({ now: NOW }),
            (error) => {
                assert.equal(error.statusCode, 503);
                assert.equal(error.code, 'HERO_POOL_TOO_SMALL');
                return true;
            },
        );
    });
});

test('updateHomeHero rejects an incomplete manual selection without writing SiteConfig', async () => {
    let wrote = false;
    await withStubs({ onUpdate: () => { wrote = true; } }, async () => {
        await assert.rejects(
            () => updateHomeHero({ mode: 'manual', movieIds: ['movie-1', 'movie-2'] }),
            (error) => {
                assert.equal(error.statusCode, 400);
                assert.equal(error.code, 'MANUAL_HERO_INVALID');
                return true;
            },
        );
    });
    assert.equal(wrote, false);
});

test('updateHomeHero reports which manual movies no longer exist', async () => {
    await withStubs({ catalog: catalogOf(3) }, async () => {
        await assert.rejects(
            () => updateHomeHero({ mode: 'manual', movieIds: ['movie-1', 'movie-2', 'movie-3', 'gone-1', 'gone-2'] }),
            (error) => {
                assert.equal(error.code, 'MANUAL_HERO_INVALID');
                assert.deepEqual(error.invalidMovies, ['gone-1', 'gone-2']);
                return true;
            },
        );
    });
});

test('getAdminHomeHero exposes the live line-up, the saved selection, and the pool', async () => {
    const movieIds = ['movie-2', 'movie-4', 'movie-6', 'movie-8', 'movie-10'];
    await withStubs({
        config: { homeHero: { mode: 'manual', movieIds }, updatedAt: new Date('2026-03-01T00:00:00Z') },
    }, async () => {
        const hero = await getAdminHomeHero({ now: NOW });
        assert.equal(hero.liveMovies.length, 5);
        assert.deepEqual(hero.manualSelection.movieIds, movieIds);
        assert.deepEqual(ids(hero.selectedMovies), movieIds);
        assert.ok(hero.availableMovies.length >= 5);
        assert.equal(hero.meta.effectiveMode, 'manual');
    });
});

test('the Hero ETag tracks movie order, seed, and mode', () => {
    const base = {
        settings: { configuredMode: 'auto', effectiveMode: 'auto' },
        meta: { source: 'poster-rotation', seed: 'hero:2026-03-10T00:00:default' },
        dateKey: '2026-03-10',
        movies: [{ id: 'a' }, { id: 'b' }],
    };
    const etag = createHeroEtag(base);

    assert.equal(createHeroEtag(base), etag);
    assert.notEqual(createHeroEtag({ ...base, movies: [{ id: 'b' }, { id: 'a' }] }), etag);
    assert.notEqual(createHeroEtag({ ...base, meta: { ...base.meta, seed: 'hero:2026-03-10T12:00:default' } }), etag);
    assert.notEqual(
        createHeroEtag({ ...base, settings: { configuredMode: 'manual', effectiveMode: 'manual' } }),
        etag,
    );
});

test('If-None-Match accepts weak and comma-separated Hero ETags', () => {
    const etag = '"hero-abc123"';
    assert.equal(matchesHeroEtag(etag, etag), true);
    assert.equal(matchesHeroEtag(`W/${etag}`, etag), true);
    assert.equal(matchesHeroEtag(`"hero-other", ${etag}`, etag), true);
    assert.equal(matchesHeroEtag('*', etag), true);
    assert.equal(matchesHeroEtag('"hero-other"', etag), false);
    assert.equal(matchesHeroEtag('', etag), false);
});
