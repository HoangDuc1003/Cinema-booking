import test from 'node:test';
import assert from 'node:assert/strict';
import HeroRotation from '../models/HeroRotation.js';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import SiteConfig from '../models/SiteConfig.js';
import {
    createHeroEtag,
    getAdminHomeHero,
    getHeroRotationKey,
    getPublicHomeHero,
    matchesHeroEtag,
    normalizeHeroMovie,
    randomizeHomeHero,
    selectHeroMovies,
    updateHomeHero,
} from '../services/heroService.js';

const DAY_MS = 24 * 60 * 60 * 1000;
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

const dateDaysBefore = (days, from = '2026-03-09') => (
    new Date(Date.parse(`${from}T00:00:00Z`) - (days * DAY_MS)).toISOString().slice(0, 10)
);

// movie-1 is the newest release (yesterday), movie-2 the day before, and so on.
const buildMovie = (index) => ({
    _id: `movie-${index}`,
    title: `Movie ${index}`,
    overview: `Overview ${index}`,
    poster_path: `/movie-${index}.jpg`,
    backdrop_path: `/movie-${index}-backdrop.jpg`,
    release_date: dateDaysBefore(index - 1),
    vote_average: 7.5,
    vote_count: 3000,
    popularity: 100 + index,
    runtime: 120,
    genres: [{ id: 28, name: 'Action' }],
});

const catalogOf = (size) => Array.from({ length: size }, (_, index) => buildMovie(index + 1));
const ids = (movies) => movies.map((movie) => movie.id);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => `movie-${from + index}`);

const clone = (value) => structuredClone(value);

// Stands in for the HeroRotation collection, including its unique _id.
const createRotationStore = () => {
    const docs = new Map();
    return {
        docs,
        findById: (id) => chain(docs.has(id) ? clone(docs.get(id)) : null),
        find: (filter = {}) => {
            const after = filter.startsAt?.$gt?.getTime() ?? -Infinity;
            const before = filter.startsAt?.$lt?.getTime() ?? Infinity;
            return chain([...docs.values()]
                .filter((doc) => doc.startsAt.getTime() > after && doc.startsAt.getTime() < before)
                .map(clone));
        },
        create: async (doc) => {
            if (docs.has(doc._id)) throw Object.assign(new Error('duplicate key'), { code: 11000 });
            docs.set(doc._id, clone(doc));
            return clone(doc);
        },
        updateOne: async ({ _id }, update) => {
            const doc = docs.get(_id);
            Object.assign(doc, update.$set || {});
            for (const [field, value] of Object.entries(update.$addToSet || {})) {
                doc[field] = [...new Set([...(doc[field] || []), ...(value.$each || [value])])];
            }
            return { matchedCount: 1, modifiedCount: 1 };
        },
    };
};

const withStubs = async ({
    catalog = catalogOf(40),
    config = null,
    rotations = createRotationStore(),
    onUpdate,
}, run) => {
    const originals = {
        movieFind: Movie.find,
        showFind: Show.find,
        configFindOne: SiteConfig.findOne,
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        rotation: {
            findById: HeroRotation.findById,
            find: HeroRotation.find,
            create: HeroRotation.create,
            updateOne: HeroRotation.updateOne,
        },
    };
    Movie.find = (filter = {}) => {
        const wanted = filter?._id?.$in;
        if (wanted) {
            const set = new Set(wanted.map(String));
            return chain(catalog.filter((movie) => set.has(String(movie._id))));
        }
        if (filter.release_date) {
            const { $gte, $lte } = filter.release_date;
            return chain(catalog.filter((movie) => movie.release_date >= $gte && movie.release_date <= $lte));
        }
        return chain(catalog);
    };
    Show.find = () => chain([]);
    SiteConfig.findOne = () => chain(config);
    SiteConfig.findOneAndUpdate = (...args) => {
        onUpdate?.(...args);
        return chain(config);
    };
    Object.assign(HeroRotation, {
        findById: rotations.findById,
        find: rotations.find,
        create: rotations.create,
        updateOne: rotations.updateOne,
    });
    try {
        return await run({ rotations, catalog });
    } finally {
        Movie.find = originals.movieFind;
        Show.find = originals.showFind;
        SiteConfig.findOne = originals.configFindOne;
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        Object.assign(HeroRotation, originals.rotation);
    }
};

const quietly = async (run) => {
    const warn = console.warn;
    const warnings = [];
    console.warn = (line) => warnings.push(JSON.parse(line));
    try {
        await run();
    } finally {
        console.warn = warn;
    }
    return warnings;
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
});

test('selection takes the five newest movies not shown recently, newest first', () => {
    const pool = catalogOf(12).map((movie) => normalizeHeroMovie(movie));
    const shuffled = [...pool].reverse();
    assert.deepEqual(ids(selectHeroMovies(shuffled)), range(1, 5));

    const lastShownAt = new Map(range(1, 5).map((id) => [id, NOW.getTime()]));
    assert.deepEqual(ids(selectHeroMovies(shuffled, { lastShownAt })), range(6, 10));
});

test('with fewer than five unshown, the movies shown longest ago fill the gap', () => {
    const pool = catalogOf(7).map((movie) => normalizeHeroMovie(movie));
    const lastShownAt = new Map([
        ...range(1, 5).map((id) => [id, slotAfter(1).getTime()]),
        ['movie-3', NOW.getTime()],
    ]);
    // Two unshown movies, then movie-3 (shown longest ago), then the newest of the rest.
    assert.deepEqual(ids(selectHeroMovies(pool, { lastShownAt })), ['movie-6', 'movie-7', 'movie-3', 'movie-1', 'movie-2']);
});

test('the first slot shows the five newest released movies, newest first', async () => {
    const upcoming = { ...buildMovie(99), _id: 'upcoming', release_date: '2026-04-01', popularity: 9999 };
    await withStubs({ catalog: [...catalogOf(40), upcoming] }, async ({ rotations }) => {
        const payload = await getPublicHomeHero({ now: NOW });
        assert.deepEqual(ids(payload.movies), range(1, 5), 'an upcoming release is not on the Hero yet');
        assert.equal(payload.settings.effectiveMode, 'auto');
        assert.equal(payload.meta.source, 'newest-rotation');
        assert.equal(payload.meta.noRepeatDays, 30);
        assert.equal(payload.meta.reusedCount, 0);
        assert.equal(payload.rotationKey, '2026-03-10T00:00');
        assert.equal(payload.rotation.startsAt, '2026-03-09T17:00:00.000Z');
        // 09:00 in Vietnam, so the next line-up is due at noon.
        assert.equal(payload.nextRefreshAt, '2026-03-10T05:00:00.000Z');
        assert.deepEqual(rotations.docs.get('2026-03-10T00:00').movieIds, range(1, 5));
    });
});

test('every request in a slot gets the stored line-up', async () => {
    await withStubs({}, async ({ rotations }) => {
        const first = await getPublicHomeHero({ now: NOW });
        const later = await getPublicHomeHero({ now: new Date('2026-03-10T04:59:00Z') });
        assert.deepEqual(ids(later.movies), ids(first.movies));
        assert.equal(rotations.docs.size, 1);
    });
});

test('each slot shows the next five newest', async () => {
    await withStubs({}, async () => {
        const lineUps = [];
        for (let slot = 0; slot < 3; slot += 1) {
            lineUps.push(ids((await getPublicHomeHero({ now: slotAfter(slot) })).movies));
        }
        assert.deepEqual(lineUps, [range(1, 5), range(6, 10), range(11, 15)]);
    });
});

test('no movie comes back within 30 days while the catalog has enough movies', async () => {
    await withStubs({ catalog: catalogOf(310) }, async () => {
        const shown = [];
        // Sixty 12-hour slots are thirty days.
        for (let slot = 0; slot < 60; slot += 1) {
            const payload = await getPublicHomeHero({ now: slotAfter(slot) });
            assert.equal(payload.meta.reusedCount, 0, `slot ${slot} repeated a movie`);
            shown.push(...ids(payload.movies));
        }
        assert.equal(shown.length, 300);
        assert.equal(new Set(shown).size, 300, 'thirty days of slots never repeat a movie');
        // Thirty days after the first slot its movies, still the newest, are back.
        assert.deepEqual(ids((await getPublicHomeHero({ now: slotAfter(60) })).movies), range(1, 5));
    });
});

test('a release added to the catalog leads the very next slot', async () => {
    const catalog = catalogOf(40);
    await withStubs({ catalog }, async () => {
        await getPublicHomeHero({ now: NOW });
        catalog.push({ ...buildMovie(0), _id: 'just-added', release_date: '2026-03-10' });
        const next = await getPublicHomeHero({ now: slotAfter(1) });
        assert.deepEqual(ids(next.movies), ['just-added', ...range(6, 9)]);
    });
});

test('a catalog too small for 30 days repeats the movies shown longest ago, and says so', async () => {
    await withStubs({ catalog: catalogOf(12) }, async () => {
        let third;
        const warnings = await quietly(async () => {
            await getPublicHomeHero({ now: NOW });
            await getPublicHomeHero({ now: slotAfter(1) });
            third = await getPublicHomeHero({ now: slotAfter(2) });
        });
        assert.deepEqual(ids(third.movies), ['movie-11', 'movie-12', 'movie-1', 'movie-2', 'movie-3']);
        assert.equal(third.meta.reusedCount, 3);
        assert.deepEqual(
            warnings.map((warning) => [warning.event, warning.reusedCount]),
            [['hero-rotation-repeats-within-window', 3]],
        );
    });
});

test('when two requests open a slot at once, the first stored line-up wins', async () => {
    const rotations = createRotationStore();
    const create = rotations.create;
    rotations.create = async (doc) => {
        // Another server instance stored its line-up a moment earlier.
        await create({ ...doc, movieIds: range(36, 40), shownMovieIds: range(36, 40) });
        return create(doc);
    };
    await withStubs({ rotations }, async () => {
        const payload = await getPublicHomeHero({ now: NOW });
        assert.deepEqual(ids(payload.movies), range(36, 40));
    });
});

test('a movie removed from the catalog mid-slot is replaced by the newest unshown one', async () => {
    const catalog = catalogOf(40);
    await withStubs({ catalog }, async ({ rotations }) => {
        await getPublicHomeHero({ now: NOW });
        catalog.splice(catalog.findIndex((movie) => movie._id === 'movie-3'), 1);
        const payload = await getPublicHomeHero({ now: NOW });
        assert.deepEqual(ids(payload.movies), ['movie-1', 'movie-2', 'movie-4', 'movie-5', 'movie-6']);
        assert.deepEqual(rotations.docs.get('2026-03-10T00:00').movieIds, ids(payload.movies));
    });
});

test('randomize swaps in five unshown movies; the swapped-out ones still count as shown', async () => {
    const updates = [];
    await withStubs({ catalog: catalogOf(60), onUpdate: (...args) => updates.push(args) }, async ({ rotations }) => {
        await getPublicHomeHero({ now: slotAfter(-1) });
        await getPublicHomeHero({ now: NOW });
        const hero = await randomizeHomeHero({ now: NOW });

        const picked = ids(hero.liveMovies);
        assert.equal(new Set(picked).size, 5);
        assert.ok(picked.every((id) => !range(1, 10).includes(id)), 'nothing shown in the last 30 days');
        assert.deepEqual(rotations.docs.get('2026-03-10T00:00').shownMovieIds.slice(0, 5), range(6, 10));
        assert.ok(updates.some(([, update]) => update.$set?.['homeHero.mode'] === 'auto'), 'randomize leaves the Hero in auto mode');

        const next = ids((await getPublicHomeHero({ now: slotAfter(1) })).movies);
        assert.ok(next.every((id) => !range(1, 10).includes(id) && !picked.includes(id)));
    });
});

test('manual mode is authoritative and preserves the saved order', async () => {
    const movieIds = ['movie-9', 'movie-3', 'movie-7', 'movie-1', 'movie-5'];
    await withStubs({
        config: { homeHero: { mode: 'manual', movieIds }, updatedAt: new Date('2026-03-01T00:00:00Z') },
    }, async ({ rotations }) => {
        const payload = await getPublicHomeHero({ now: NOW });
        assert.equal(payload.settings.effectiveMode, 'manual');
        assert.equal(payload.meta.source, 'manual-selection');
        assert.deepEqual(ids(payload.movies), movieIds);
        assert.equal(rotations.docs.size, 0, 'manual posters are not rotation history');
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
        assert.equal(payload.meta.source, 'newest-rotation');
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

test('the Hero ETag tracks movie order, slot, and mode', () => {
    const base = {
        settings: { configuredMode: 'auto', effectiveMode: 'auto' },
        meta: { source: 'newest-rotation' },
        dateKey: '2026-03-10',
        nextRefreshAt: '2026-03-10T05:00:00.000Z',
        movies: [{ id: 'a' }, { id: 'b' }],
    };
    const etag = createHeroEtag(base);

    assert.equal(createHeroEtag(base), etag);
    assert.notEqual(createHeroEtag({ ...base, movies: [{ id: 'b' }, { id: 'a' }] }), etag);
    assert.notEqual(createHeroEtag({ ...base, nextRefreshAt: '2026-03-10T17:00:00.000Z' }), etag);
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
