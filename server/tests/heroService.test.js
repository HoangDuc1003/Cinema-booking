import test from 'node:test';
import assert from 'node:assert/strict';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import SiteConfig from '../models/SiteConfig.js';
import {
    createHeroEtag,
    getAdminHomeHero,
    getHeroDailySeed,
    getPublicHomeHero,
    matchesHeroEtag,
    normalizeHeroMovie,
    selectDailyPosterMovies,
    updateHomeHero,
} from '../services/heroService.js';

const chain = (value) => ({
    select: () => chain(value),
    populate: () => chain(value),
    sort: () => chain(value),
    limit: () => chain(value),
    lean: async () => value,
});

const buildMovie = (index) => ({
    _id: `movie-${index}`,
    title: `Movie ${index}`,
    overview: `Overview ${index}`,
    poster_path: `/poster-${index}.jpg`,
    backdrop_path: `/backdrop-${index}.jpg`,
    release_date: '2026-01-01',
    vote_average: 7.5,
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

test('the daily seed changes with the Vietnam calendar day, not with the clock', () => {
    const morning = new Date('2026-03-10T02:00:00.000Z');
    const evening = new Date('2026-03-10T15:00:00.000Z');
    // 2026-03-10T17:00Z is already 2026-03-11 in Vietnam (UTC+7).
    const nextDay = new Date('2026-03-10T17:30:00.000Z');

    assert.equal(getHeroDailySeed(morning), getHeroDailySeed(evening));
    assert.notEqual(getHeroDailySeed(morning), getHeroDailySeed(nextDay));
});

test('daily selection returns exactly five unique movies and is stable for the whole day', () => {
    const pool = buildPool(20).map(normalizeHeroMovie);
    const morning = new Date('2026-03-10T02:00:00.000Z');
    const evening = new Date('2026-03-10T15:00:00.000Z');

    const first = selectDailyPosterMovies(pool, morning);
    const second = selectDailyPosterMovies(pool, evening);

    assert.equal(first.length, 5);
    assert.equal(new Set(first.map((movie) => movie.id)).size, 5);
    assert.deepEqual(first.map((movie) => movie.id), second.map((movie) => movie.id));
});

test('selection order does not depend on the order MongoDB returned the pool in', () => {
    const pool = buildPool(20).map(normalizeHeroMovie);
    const shuffledPool = [...pool].reverse();
    const now = new Date('2026-03-10T02:00:00.000Z');

    assert.deepEqual(
        selectDailyPosterMovies(pool, now).map((movie) => movie.id),
        selectDailyPosterMovies(shuffledPool, now).map((movie) => movie.id),
    );
});

test('a different day reshuffles the line-up', () => {
    const pool = buildPool(30).map(normalizeHeroMovie);
    const days = ['2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13'].map(
        (day) => selectDailyPosterMovies(pool, new Date(`${day}T02:00:00.000Z`)).map((movie) => movie.id).join(','),
    );
    // With a 30-movie pool, four consecutive days must not all produce one line-up.
    assert.ok(new Set(days).size > 1, `daily seed did not rotate: ${days.join(' | ')}`);
});

test('a different seed salt reshuffles the line-up without waiting for the next day', () => {
    const pool = buildPool(30).map(normalizeHeroMovie);
    const now = new Date('2026-03-10T02:00:00.000Z');
    const base = selectDailyPosterMovies(pool, now).map((movie) => movie.id).join(',');
    const salted = selectDailyPosterMovies(pool, now, 'admin-randomized').map((movie) => movie.id).join(',');
    assert.notEqual(base, salted);
});

test('a pool at or below five movies is returned whole instead of being dropped', () => {
    const pool = buildPool(5).map(normalizeHeroMovie);
    assert.equal(selectDailyPosterMovies(pool, new Date()).length, 5);
});

test('auto mode returns five movies plus the seed metadata clients cache on', async () => {
    await withStubs({}, async () => {
        const payload = await getPublicHomeHero({ now: new Date('2026-03-10T02:00:00.000Z') });
        assert.equal(payload.movies.length, 5);
        assert.equal(payload.settings.effectiveMode, 'auto');
        assert.equal(payload.meta.source, 'daily-poster-rotation');
        assert.equal(payload.dateKey, '2026-03-10');
        assert.equal(payload.meta.seed, 'hero:2026-03-10:default');
        assert.equal(payload.rotation.type, 'daily-poster');
        assert.equal(payload.nextRefreshAt, '2026-03-10T17:00:00.000Z');
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
        assert.equal(payload.meta.source, 'daily-poster-rotation');
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
        meta: { source: 'daily-poster-rotation', seed: 'hero:2026-03-10:default' },
        dateKey: '2026-03-10',
        movies: [{ id: 'a' }, { id: 'b' }],
    };
    const etag = createHeroEtag(base);

    assert.equal(createHeroEtag(base), etag);
    assert.notEqual(createHeroEtag({ ...base, movies: [{ id: 'b' }, { id: 'a' }] }), etag);
    assert.notEqual(createHeroEtag({ ...base, meta: { ...base.meta, seed: 'hero:2026-03-11:default' } }), etag);
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
