import test from 'node:test';
import assert from 'node:assert/strict';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import SiteConfig from '../models/SiteConfig.js';
import {
    createHeroEtag,
    getAdminHomeHero,
    getHeroSeed,
    getPublicHomeHero,
    matchesHeroEtag,
    normalizeHeroMovie,
    pickDailyRotation,
    hasHeroTranslation,
    selectHeroMovies,
    selectTranslatedHeroMovies,
    updateHomeHero,
} from '../services/heroService.js';

const DAY_MS = 86400000;
// 09:00 in Vietnam on 2026-03-10.
const NOW = new Date('2026-03-10T02:00:00.000Z');
const dayAfter = (days, from = NOW) => new Date(from.getTime() + (days * DAY_MS));

const chain = (value) => ({
    select: () => chain(value),
    populate: () => chain(value),
    sort: () => chain(value),
    limit: () => chain(value),
    lean: async () => value,
});

// Runtime and genres are present so the Hero never reaches for TMDB details.
const buildHot = (index) => ({
    _id: `hot-${index}`,
    title: `Hot ${index}`,
    overview: `New release ${index}`,
    poster_path: `/hot-${index}.jpg`,
    backdrop_path: `/hot-${index}-backdrop.jpg`,
    release_date: '2026-02-20',
    vote_average: 7,
    vote_count: 300,
    popularity: 900 - index,
    runtime: 105,
    genres: [{ id: 28, name: 'Action' }],
});

const buildClassic = (index) => ({
    _id: `classic-${index}`,
    title: `Classic ${index}`,
    overview: `Classic ${index}`,
    poster_path: `/classic-${index}.jpg`,
    backdrop_path: `/classic-${index}-backdrop.jpg`,
    release_date: '1994-09-23',
    vote_average: 8.4,
    vote_count: 20000 - index,
    popularity: 40,
    runtime: 140,
    genres: [{ id: 18, name: 'Drama' }],
});

const hotPool = (size = 6) => Array.from({ length: size }, (_, index) => normalizeHeroMovie(buildHot(index + 1)));
const classicPool = (size = 20) => Array.from({ length: size }, (_, index) => normalizeHeroMovie(buildClassic(index + 1)));
const ids = (movies) => movies.map((movie) => movie.id);

const nowShowingOf = (movies) => async () => ({ value: { results: movies } });

const withStubs = async ({
    classics = Array.from({ length: 20 }, (_, index) => buildClassic(index + 1)),
    recent = [],
    manualMovies = [],
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
            return chain([...manualMovies, ...classics].filter((movie) => set.has(String(movie._id))));
        }
        if (filter.release_date?.$lte && !filter.release_date?.$gte?.startsWith?.('19')) return chain(recent);
        if (filter.release_date?.$lte) return chain(classics);
        return chain([...classics, ...manualMovies]);
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
        ...buildHot(1),
        heroVideoUrl: 'https://res.cloudinary.com/demo/video/upload/x.mp4',
        heroVideoStatus: 'ready',
        heroVideoMimeType: 'video/mp4',
    });
    for (const key of Object.keys(normalized)) {
        assert.ok(!key.toLowerCase().includes('video'), `unexpected video field: ${key}`);
    }
    assert.equal(normalized.id, 'hot-1');
});

test('list entries with genre IDs only still get genre names', () => {
    const normalized = normalizeHeroMovie({ id: 1288445, title: 'Mutiny', genre_ids: [28, 53], poster_path: '/x.jpg' });
    assert.deepEqual(normalized.genres.map((genre) => genre.name), ['Action', 'Thriller']);
    assert.equal(normalized.runtime, null, 'a missing runtime is not reported as zero');
});

test('the seed is one per Vietnam day and turns over at local midnight', () => {
    // 16:59 UTC is 23:59 in Vietnam; 17:00 UTC is already the next local day.
    assert.equal(getHeroSeed({ now: new Date('2026-03-10T02:00:00Z') }), getHeroSeed({ now: new Date('2026-03-10T16:59:00Z') }));
    assert.notEqual(getHeroSeed({ now: new Date('2026-03-10T16:59:00Z') }), getHeroSeed({ now: new Date('2026-03-10T17:00:00Z') }));
    assert.match(getHeroSeed({ now: NOW, salt: 'abc' }), /^hero:2026-03-10:abc$/);
});

test('the line-up is two hot releases, hotter first, then three classics', () => {
    const picked = selectHeroMovies({ hot: hotPool(), classic: classicPool() }, { now: NOW });

    assert.equal(picked.length, 5);
    assert.equal(new Set(ids(picked)).size, 5);
    assert.deepEqual(picked.map((movie) => movie.heroSlot), ['hot', 'hot', 'classic', 'classic', 'classic']);
    assert.ok(picked.slice(0, 2).every((movie) => movie.id.startsWith('hot-')));
    assert.ok(picked.slice(2).every((movie) => movie.id.startsWith('classic-')));
    assert.ok(picked[0].popularity >= picked[1].popularity, 'the hotter of the pair leads');
});

test('every slot changes from one day to the next', () => {
    const pools = { hot: hotPool(), classic: classicPool() };
    for (let day = 0; day < 10; day += 1) {
        const today = selectHeroMovies(pools, { now: dayAfter(day) });
        const tomorrow = new Set(ids(selectHeroMovies(pools, { now: dayAfter(day + 1) })));
        assert.ok(ids(today).every((id) => !tomorrow.has(id)), `day ${day} shares a poster with the next day`);
    }
});

test('one day keeps the same line-up from morning to night', () => {
    const pools = { hot: hotPool(), classic: classicPool() };
    assert.deepEqual(
        ids(selectHeroMovies(pools, { now: new Date('2026-03-09T17:00:00Z') })),
        ids(selectHeroMovies(pools, { now: new Date('2026-03-10T16:59:00Z') })),
    );
});

test('the hot pair only ever comes from the hottest six releases', () => {
    const hot = hotPool(6);
    const seen = new Set();
    for (let day = 0; day < 12; day += 1) {
        ids(pickDailyRotation(hot, { count: 2, now: dayAfter(day), key: 'hero:hot:default' })).forEach((id) => seen.add(id));
    }
    assert.deepEqual([...seen].sort(), ids(hot).sort(), 'the rotation walks the whole pool');
});

test('selection does not depend on the order the pools arrived in', () => {
    const hot = hotPool();
    const classic = classicPool();
    assert.deepEqual(
        ids(selectHeroMovies({ hot, classic }, { now: NOW })),
        ids(selectHeroMovies({ hot: [...hot].reverse(), classic: [...classic].reverse() }, { now: NOW })),
    );
});

test('an admin salt reshuffles the day without waiting for midnight', () => {
    const pools = { hot: hotPool(), classic: classicPool() };
    assert.notDeepEqual(
        ids(selectHeroMovies(pools, { now: NOW })),
        ids(selectHeroMovies(pools, { now: NOW, salt: 'admin-randomized' })),
    );
});

test('a short classic pool is filled from the other pool instead of shipping a short Hero', () => {
    const picked = selectHeroMovies({ hot: hotPool(6), classic: classicPool(1) }, { now: NOW });
    assert.equal(picked.length, 5);
    assert.equal(new Set(ids(picked)).size, 5);
    assert.deepEqual(picked.slice(0, 3).map((movie) => movie.heroSlot), ['hot', 'hot', 'classic']);
});

test('auto mode leads with now-showing releases and carries the daily metadata', async () => {
    await withStubs({}, async () => {
        const payload = await getPublicHomeHero({
            now: NOW,
            loadNowShowing: nowShowingOf(Array.from({ length: 10 }, (_, index) => buildHot(index + 1))),
        });
        assert.equal(payload.movies.length, 5);
        assert.equal(payload.settings.effectiveMode, 'auto');
        assert.equal(payload.meta.source, 'daily-poster-rotation');
        assert.equal(payload.meta.hotSource, 'now-showing');
        assert.equal(payload.meta.hotCount, 2);
        assert.equal(payload.meta.classicCount, 3);
        assert.equal(payload.dateKey, '2026-03-10');
        assert.equal(payload.rotation.type, 'daily-poster');
        // The next rotation is the coming Vietnam midnight.
        assert.equal(payload.nextRefreshAt, '2026-03-10T17:00:00.000Z');
        assert.equal('personalized' in payload, false, 'one line-up for everyone');
        // Only the six hottest releases are ever candidates for the pair.
        const hottestSix = new Set(Array.from({ length: 6 }, (_, index) => `hot-${index + 1}`));
        assert.ok(payload.movies.slice(0, 2).every((movie) => hottestSix.has(movie.id)));
    });
});

test('recent releases from the database stand in when now-showing is down', async () => {
    const recent = [buildHot(1), buildHot(2), buildHot(3)].map((movie) => ({ ...movie, _id: `recent-${movie._id}` }));
    await withStubs({ recent }, async () => {
        const payload = await getPublicHomeHero({
            now: NOW,
            loadNowShowing: async () => { throw Object.assign(new Error('down'), { code: 'TMDB_UNAVAILABLE' }); },
        });
        assert.equal(payload.meta.hotSource, 'recent-releases');
        assert.ok(payload.movies.slice(0, 2).every((movie) => movie.id.startsWith('recent-')));
        assert.equal(payload.movies.length, 5);
    });
});

test('manual mode is authoritative and preserves the saved order', async () => {
    const manualMovies = [9, 3, 7, 1, 5].map((index) => buildClassic(index));
    const movieIds = manualMovies.map((movie) => movie._id);
    await withStubs({
        classics: manualMovies,
        config: { homeHero: { mode: 'manual', movieIds }, updatedAt: new Date('2026-03-01T00:00:00Z') },
    }, async () => {
        const payload = await getPublicHomeHero({ now: NOW, loadNowShowing: nowShowingOf([]) });
        assert.equal(payload.settings.effectiveMode, 'manual');
        assert.equal(payload.meta.source, 'manual-selection');
        assert.deepEqual(ids(payload.movies), movieIds);
    });
});

test('manual mode falls back to the daily rotation when a saved movie disappears', async () => {
    await withStubs({
        config: {
            homeHero: { mode: 'manual', movieIds: ['classic-1', 'classic-2', 'gone-1', 'gone-2', 'gone-3'] },
            updatedAt: new Date('2026-03-01T00:00:00Z'),
        },
    }, async () => {
        const payload = await getPublicHomeHero({
            now: NOW,
            loadNowShowing: nowShowingOf(Array.from({ length: 6 }, (_, index) => buildHot(index + 1))),
        });
        assert.equal(payload.movies.length, 5);
        assert.equal(payload.settings.effectiveMode, 'auto');
        assert.equal(payload.meta.source, 'daily-poster-rotation');
    });
});

test('pools that cannot fill five slots are a 503, never a short Hero', async () => {
    await withStubs({ classics: [buildClassic(1)] }, async () => {
        await assert.rejects(
            () => getPublicHomeHero({ now: NOW, loadNowShowing: nowShowingOf([buildHot(1)]) }),
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
            () => updateHomeHero({ mode: 'manual', movieIds: ['classic-1', 'classic-2'] }),
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
    await withStubs({ classics: [1, 2, 3].map(buildClassic) }, async () => {
        await assert.rejects(
            () => updateHomeHero({ mode: 'manual', movieIds: ['classic-1', 'classic-2', 'classic-3', 'gone-1', 'gone-2'] }),
            (error) => {
                assert.equal(error.code, 'MANUAL_HERO_INVALID');
                assert.deepEqual(error.invalidMovies, ['gone-1', 'gone-2']);
                return true;
            },
        );
    });
});

test('getAdminHomeHero exposes the live line-up, the saved selection, and the pool', async () => {
    const movieIds = ['classic-2', 'classic-4', 'classic-6', 'classic-8', 'classic-10'];
    await withStubs({
        config: { homeHero: { mode: 'manual', movieIds }, updatedAt: new Date('2026-03-01T00:00:00Z') },
    }, async () => {
        const hero = await getAdminHomeHero({ now: NOW, loadNowShowing: nowShowingOf([]) });
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

test('a classic without a Vietnamese title and synopsis is swapped for a translated one', async () => {
    const pools = { hot: hotPool(), classic: classicPool() };
    const firstPick = selectHeroMovies(pools, { now: NOW }).filter((movie) => movie.heroSlot === 'classic');
    const untranslated = new Set([firstPick[0].id, firstPick[2].id]);
    const checked = [];

    const picked = await selectTranslatedHeroMovies(pools, { now: NOW }, {
        isTranslated: async (movie) => { checked.push(movie.id); return !untranslated.has(movie.id); },
    });

    assert.equal(picked.length, 5);
    assert.deepEqual(picked.map((movie) => movie.heroSlot), ['hot', 'hot', 'classic', 'classic', 'classic']);
    assert.ok(picked.every((movie) => !untranslated.has(movie.id)));
    assert.ok(checked.every((id) => id.startsWith('classic-')), 'hot releases are not checked');
    // Deterministic: the same day gives the same line-up.
    const again = await selectTranslatedHeroMovies(pools, { now: NOW }, { isTranslated: async (movie) => !untranslated.has(movie.id) });
    assert.deepEqual(ids(again), ids(picked));
});

test('when too few classics are translated the Hero still ships five posters', async () => {
    const picked = await selectTranslatedHeroMovies(
        { hot: hotPool(), classic: classicPool(4) },
        { now: NOW },
        { isTranslated: async () => false },
    );
    assert.equal(picked.length, 5);
});

test('translation check needs both title and synopsis, and an unreachable TMDB does not reject', async () => {
    const movie = { id: '42' };
    const vi = (text) => async () => ({ translations: { 'vi-VN': text, vi: text }, alternativeTitles: {} });
    assert.equal(await hasHeroTranslation(movie, { loadTranslations: vi({ title: 'Người Mặt Nạ Sắt', overview: 'Mô tả' }) }), true);
    assert.equal(await hasHeroTranslation(movie, { loadTranslations: vi({ title: 'Người Mặt Nạ Sắt', overview: '' }) }), false);
    assert.equal(await hasHeroTranslation(movie, { loadTranslations: async () => ({ translations: {}, alternativeTitles: { VN: 'Tên VN' } }) }), false);
    const warn = console.warn;
    console.warn = () => {};
    try {
        assert.equal(await hasHeroTranslation(movie, { loadTranslations: async () => { throw new Error('down'); } }), true);
    } finally {
        console.warn = warn;
    }
});
