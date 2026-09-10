import test from 'node:test';
import assert from 'node:assert/strict';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import SiteConfig from '../models/SiteConfig.js';
import {
    createHeroEtag,
    getAdminHomeHero,
    getHeroSeed,
    getHeroSeedWindow,
    getPublicHomeHero,
    matchesHeroEtag,
    normalizeHeroMovie,
    selectHeroMovies,
    updateHomeHero,
} from '../services/heroService.js';

const chain = (value) => ({
    select: () => chain(value),
    populate: () => chain(value),
    sort: () => chain(value),
    limit: () => chain(value),
    lean: async () => value,
});

// Popularity descends with the index, so movie-1 and movie-2 are always the two
// hottest and every other movie is a seeded candidate.
const buildMovie = (index) => ({
    _id: `movie-${index}`,
    title: `Movie ${index}`,
    overview: `Overview ${index}`,
    poster_path: `/poster-${index}.jpg`,
    backdrop_path: `/backdrop-${index}.jpg`,
    release_date: '2026-01-01',
    vote_average: 7.5,
    vote_count: 1000,
    popularity: 1000 - index,
    runtime: 110,
    genres: [{ id: 28, name: 'Action' }],
});

const buildPool = (size) => Array.from({ length: size }, (_, index) => buildMovie(index + 1));

const withStubs = async ({ movies = buildPool(20), config = null, onUpdate }, run) => {
    const originals = {
        movieFind: Movie.find,
        showFind: Show.find,
        configFindOne: SiteConfig.findOne,
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
    };
    Movie.find = (filter) => {
        const ids = filter?._id?.$in;
        if (!ids) return chain(movies);
        const wanted = new Set(ids.map(String));
        return chain(movies.filter((movie) => wanted.has(String(movie._id))));
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
    assert.equal(normalized.poster_path, '/poster-1.jpg');
});

test('a seed window spans three Vietnam days and turns over at local midnight', () => {
    // 2026-03-10T17:00Z is already 2026-03-11 in Vietnam (UTC+7).
    const window = getHeroSeedWindow(new Date('2026-03-10T02:00:00.000Z'));
    const sameWindowLater = getHeroSeedWindow(new Date('2026-03-10T15:00:00.000Z'));

    assert.equal(window.key, sameWindowLater.key);
    assert.equal(window.endsAt.getTime() - window.startsAt.getTime(), 3 * 86400000);
    // The boundary is Vietnam midnight, i.e. 17:00 UTC on the previous day.
    assert.match(window.startsAt.toISOString(), /T17:00:00\.000Z$/);
    assert.match(window.endsAt.toISOString(), /T17:00:00\.000Z$/);
});

test('the seed holds for three days and then rolls', () => {
    const seedAt = (iso) => getHeroSeed({ now: new Date(iso), viewerId: 'user-1' });
    const windowStart = getHeroSeedWindow(new Date('2026-03-10T02:00:00.000Z')).startsAt;
    const dayIn = (days) => new Date(windowStart.getTime() + (days * 86400000) + 3600000).toISOString();

    const first = seedAt(dayIn(0));
    assert.equal(seedAt(dayIn(1)), first, 'day 2 of the window must keep the seed');
    assert.equal(seedAt(dayIn(2)), first, 'day 3 of the window must keep the seed');
    assert.notEqual(seedAt(dayIn(3)), first, 'day 4 starts a new window');
});

test('each account gets its own seed, and signed-out visitors share one', () => {
    const now = new Date('2026-03-10T02:00:00.000Z');
    const userA = getHeroSeed({ now, viewerId: 'user-a' });
    const userB = getHeroSeed({ now, viewerId: 'user-b' });

    assert.notEqual(userA, userB);
    assert.equal(getHeroSeed({ now }), getHeroSeed({ now, viewerId: null }));
    assert.equal(getHeroSeed({ now, viewerId: '  ' }), getHeroSeed({ now, viewerId: undefined }));
    assert.notEqual(getHeroSeed({ now }), userA);
});

test('selection is two hottest movies plus three seeded, all unique', () => {
    const pool = buildPool(20).map(normalizeHeroMovie);
    const picked = selectHeroMovies(pool, { now: new Date('2026-03-10T02:00:00.000Z'), viewerId: 'user-1' });

    assert.equal(picked.length, 5);
    assert.equal(new Set(picked.map((movie) => movie.id)).size, 5);
    assert.deepEqual(picked.slice(0, 2).map((movie) => movie.id), ['movie-1', 'movie-2']);
});

test('the hot pair is identical for every account; only the other three differ', () => {
    const pool = buildPool(30).map(normalizeHeroMovie);
    const now = new Date('2026-03-10T02:00:00.000Z');
    const a = selectHeroMovies(pool, { now, viewerId: 'user-a' }).map((movie) => movie.id);
    const b = selectHeroMovies(pool, { now, viewerId: 'user-b' }).map((movie) => movie.id);

    assert.deepEqual(a.slice(0, 2), b.slice(0, 2));
    assert.notDeepEqual(a.slice(2), b.slice(2));
});

test('one account keeps the same five movies for the whole window', () => {
    const pool = buildPool(30).map(normalizeHeroMovie);
    const morning = new Date('2026-03-10T02:00:00.000Z');
    const evening = new Date('2026-03-10T15:00:00.000Z');

    assert.deepEqual(
        selectHeroMovies(pool, { now: morning, viewerId: 'user-1' }).map((movie) => movie.id),
        selectHeroMovies(pool, { now: evening, viewerId: 'user-1' }).map((movie) => movie.id),
    );
});

test('selection order does not depend on the order MongoDB returned the pool in', () => {
    const pool = buildPool(20).map(normalizeHeroMovie);
    const shuffledPool = [...pool].reverse();
    const now = new Date('2026-03-10T02:00:00.000Z');

    assert.deepEqual(
        selectHeroMovies(pool, { now, viewerId: 'user-1' }).map((movie) => movie.id),
        selectHeroMovies(shuffledPool, { now, viewerId: 'user-1' }).map((movie) => movie.id),
    );
});

test('a new window reshuffles the seeded three', () => {
    const pool = buildPool(30).map(normalizeHeroMovie);
    const windows = [0, 3, 6, 9].map((offset) => {
        const now = new Date(Date.parse('2026-03-10T02:00:00.000Z') + (offset * 86400000));
        return selectHeroMovies(pool, { now, viewerId: 'user-1' }).slice(2).map((movie) => movie.id).join(',');
    });
    assert.ok(new Set(windows).size > 1, `seed did not roll across windows: ${windows.join(' | ')}`);
});

test('a different seed salt reshuffles without waiting for the next window', () => {
    const pool = buildPool(30).map(normalizeHeroMovie);
    const now = new Date('2026-03-10T02:00:00.000Z');
    const base = selectHeroMovies(pool, { now, viewerId: 'user-1' }).slice(2).map((movie) => movie.id).join(',');
    const salted = selectHeroMovies(pool, { now, viewerId: 'user-1', salt: 'admin-randomized' })
        .slice(2).map((movie) => movie.id).join(',');
    assert.notEqual(base, salted);
});

test('a pool at or below five movies is returned whole instead of being dropped', () => {
    const pool = buildPool(5).map(normalizeHeroMovie);
    assert.equal(selectHeroMovies(pool, { now: new Date(), viewerId: 'user-1' }).length, 5);
});

test('auto mode returns five movies plus the seed metadata clients cache on', async () => {
    await withStubs({}, async () => {
        const payload = await getPublicHomeHero({
            now: new Date('2026-03-10T02:00:00.000Z'),
            viewerId: 'user-1',
        });
        assert.equal(payload.movies.length, 5);
        assert.equal(payload.settings.effectiveMode, 'auto');
        assert.equal(payload.meta.source, 'seeded-poster-rotation');
        assert.equal(payload.dateKey, '2026-03-10');
        assert.equal(payload.meta.seedWindowDays, 3);
        assert.equal(payload.meta.hotCount, 2);
        assert.equal(payload.rotation.type, 'seeded-poster');
        assert.equal(payload.personalized, true);
        assert.match(payload.meta.seed, /^hero:w\d+:user-1:default$/);
        assert.equal(
            payload.nextRefreshAt,
            new Date(Date.parse(payload.meta.seedWindowStartsAt) + (3 * 86400000)).toISOString(),
        );
    });
});

test('manual mode is authoritative and preserves the saved order', async () => {
    const movieIds = ['movie-9', 'movie-3', 'movie-7', 'movie-1', 'movie-5'];
    await withStubs({
        config: { homeHero: { mode: 'manual', movieIds }, updatedAt: new Date('2026-03-01T00:00:00Z') },
    }, async () => {
        const payload = await getPublicHomeHero({ now: new Date('2026-03-10T02:00:00.000Z') });
        assert.equal(payload.settings.effectiveMode, 'manual');
        assert.equal(payload.meta.source, 'manual-selection');
        assert.deepEqual(payload.movies.map((movie) => movie.id), movieIds);
    });
});

test('manual mode falls back to the daily rotation when a saved movie disappears', async () => {
    await withStubs({
        movies: buildPool(20),
        config: {
            homeHero: { mode: 'manual', movieIds: ['movie-1', 'movie-2', 'gone-1', 'gone-2', 'gone-3'] },
            updatedAt: new Date('2026-03-01T00:00:00Z'),
        },
    }, async () => {
        const payload = await getPublicHomeHero({ now: new Date('2026-03-10T02:00:00.000Z') });
        assert.equal(payload.movies.length, 5);
        assert.equal(payload.settings.effectiveMode, 'auto');
        assert.equal(payload.meta.source, 'seeded-poster-rotation');
        // Signed out: shared seed, so the response stays publicly cacheable.
        assert.equal(payload.personalized, false);
    });
});

test('a pool that cannot fill five slots is a 503, never a short Hero', async () => {
    await withStubs({ movies: buildPool(3) }, async () => {
        await assert.rejects(
            () => getPublicHomeHero({ now: new Date('2026-03-10T02:00:00.000Z') }),
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
    await withStubs({ movies: buildPool(3) }, async () => {
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
        const hero = await getAdminHomeHero({ now: new Date('2026-03-10T02:00:00.000Z') });
        assert.equal(hero.liveMovies.length, 5);
        assert.deepEqual(hero.manualSelection.movieIds, movieIds);
        assert.deepEqual(hero.selectedMovies.map((movie) => movie.id), movieIds);
        assert.ok(hero.availableMovies.length >= 5);
        assert.equal(hero.meta.effectiveMode, 'manual');
    });
});

test('the Hero ETag tracks movie order, seed, and mode', () => {
    const base = {
        settings: { configuredMode: 'auto', effectiveMode: 'auto' },
        meta: { source: 'seeded-poster-rotation', seed: 'hero:w6000:user-1:default' },
        dateKey: '2026-03-10',
        movies: [{ id: 'a' }, { id: 'b' }],
    };
    const etag = createHeroEtag(base);

    assert.equal(createHeroEtag(base), etag);
    assert.notEqual(createHeroEtag({ ...base, movies: [{ id: 'b' }, { id: 'a' }] }), etag);
    assert.notEqual(createHeroEtag({ ...base, meta: { ...base.meta, seed: 'hero:w6001:user-1:default' } }), etag);
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
