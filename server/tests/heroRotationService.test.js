import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assertHeroPoolAssetsReady,
    buildHeroPoolFromCatalog,
    calculateNextHeroRefreshAt,
    createHeroEtag,
    getHeroLocalDateKey,
    getHeroRefreshRunIdentity,
    getHeroRefreshWindow,
    isHeroRefreshDue,
    matchesHeroEtag,
    selectActiveHeroMovieIds,
    shouldRetryHeroRefreshError,
    HeroRotationError,
    validateNativeHeroMovie,
} from '../services/heroRotationService.js';
import { validateHeroRuntimeConfig } from '../configs/heroRotation.js';
import Movie from '../models/Movie.js';

const groups = {
    newestMovieIds: Array.from({ length: 5 }, (_, index) => `new-${index}`),
    hotMovieIds: Array.from({ length: 5 }, (_, index) => `hot-${index}`),
    discoveryMovieIds: Array.from({ length: 5 }, (_, index) => `discovery-${index}`),
};

test('seeded Hero selection returns five unique movies covering all three categories', () => {
    const selected = selectActiveHeroMovieIds({ ...groups, selectionSeed: 'seed-a' });
    const pool = new Set(Object.values(groups).flat());
    assert.equal(selected.length, 5);
    assert.equal(new Set(selected).size, 5);
    assert.ok(selected.every((id) => pool.has(id)));
    assert.ok(selected.some((id) => groups.newestMovieIds.includes(id)));
    assert.ok(selected.some((id) => groups.hotMovieIds.includes(id)));
    assert.ok(selected.some((id) => groups.discoveryMovieIds.includes(id)));
});

test('same Hero seed is reproducible and previous selection is avoided when capacity permits', () => {
    const first = selectActiveHeroMovieIds({ ...groups, selectionSeed: 'stable-seed' });
    const repeated = selectActiveHeroMovieIds({ ...groups, selectionSeed: 'stable-seed' });
    const differentSeed = selectActiveHeroMovieIds({ ...groups, selectionSeed: 'different-seed' });
    const next = selectActiveHeroMovieIds({
        ...groups,
        selectionSeed: 'next-seed',
        previousHeroMovieIds: first,
    });
    assert.deepEqual(repeated, first);
    assert.notDeepEqual(differentSeed, first);
    assert.equal(next.some((id) => first.includes(id)), false);
    assert.notDeepEqual(next, first);
});

test('Hero selection rejects overlapping or incomplete category pools', () => {
    assert.throws(
        () => selectActiveHeroMovieIds({
            ...groups,
            hotMovieIds: [...groups.hotMovieIds.slice(0, 4), groups.newestMovieIds[0]],
            selectionSeed: 'bad-overlap',
        }),
        (error) => error.code === 'HERO_POOL_OVERLAP',
    );
    assert.throws(
        () => selectActiveHeroMovieIds({
            ...groups,
            discoveryMovieIds: groups.discoveryMovieIds.slice(0, 4),
            selectionSeed: 'bad-size',
        }),
        (error) => error.code === 'HERO_POOL_INVALID',
    );
});

test('Vietnam midnight refresh calculations cross month and year boundaries', () => {
    const endOfJanuary = new Date('2026-01-31T00:00:00+07:00');
    const endOfYear = new Date('2026-12-31T00:00:00+07:00');
    assert.equal(
        calculateNextHeroRefreshAt(endOfJanuary).toISOString(),
        '2026-02-01T17:00:00.000Z',
    );
    assert.equal(
        calculateNextHeroRefreshAt(endOfYear).toISOString(),
        '2027-01-01T17:00:00.000Z',
    );
    assert.equal(getHeroLocalDateKey(endOfYear), '2026-12-31');

    const manualMiddayRefresh = new Date('2026-01-31T12:00:00+07:00');
    const nextAfterManual = calculateNextHeroRefreshAt(manualMiddayRefresh);
    assert.equal(nextAfterManual.toISOString(), '2026-02-02T17:00:00.000Z');
    assert.ok(nextAfterManual.getTime() - manualMiddayRefresh.getTime() >= 48 * 60 * 60 * 1000);
});

test('daily scheduler due-check waits until persisted nextRefreshAt', () => {
    const nextRefreshAt = new Date('2026-08-01T17:00:00.000Z');
    assert.equal(isHeroRefreshDue({
        now: new Date('2026-08-01T16:59:59.999Z'),
        nextRefreshAt,
    }), false);
    assert.equal(isHeroRefreshDue({ now: nextRefreshAt, nextRefreshAt }), true);
    assert.equal(isHeroRefreshDue({ now: new Date(), nextRefreshAt: null }), true);
    const window = getHeroRefreshWindow(new Date('2026-08-02T00:00:00+07:00'));
    assert.equal(window.timezone, 'Asia/Ho_Chi_Minh');
    assert.equal(window.nextRefreshAt.getTime() - window.startsAt.getTime(), 48 * 60 * 60 * 1000);
});

test('native asset validation rejects mock, generic, unbound, and incomplete sources', () => {
    const valid = {
        _id: '101',
        heroVideoStatus: 'ready',
        heroVideoMovieId: '101',
        heroVideoId: 'hero_trailers/101/official',
        heroVideoUrl: 'https://res.cloudinary.com/test/video/upload/101.mp4',
        heroVideoMimeType: 'video/mp4',
        heroVideoDuration: 90,
        heroVideoWidth: 1920,
        heroVideoHeight: 1080,
        heroVideoBytes: 1_000_000,
        heroVideoCodec: 'h264/aac',
        heroVideoVersion: '1',
        heroVideoPosterUrl: 'https://res.cloudinary.com/test/image/upload/101.jpg',
        heroVideoVerifiedAt: new Date(),
    };
    assert.equal(validateNativeHeroMovie(valid).valid, true);
    const invalid = validateNativeHeroMovie({
        ...valid,
        heroVideoMovieId: 'other',
        heroVideoId: 'hero_trailers/cinematic_universal_loop_1',
        heroVideoUrl: '/mock/hero-trailer.mp4',
        heroVideoDuration: 0,
    });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.reasons.includes('movie-binding-mismatch'));
    assert.ok(invalid.reasons.includes('mock-video'));
    assert.ok(invalid.reasons.includes('generic-video'));
    assert.ok(invalid.reasons.includes('missing-duration'));
});

test('native asset validation enforces limits, codec pair, version, and poster metadata', () => {
    const base = {
        _id: 'asset-1',
        heroVideoStatus: 'ready',
        heroVideoMovieId: 'asset-1',
        heroVideoId: 'hero_trailers/asset-1/official',
        heroVideoUrl: 'https://res.cloudinary.com/test/video/upload/asset-1.mp4',
        heroVideoMimeType: 'video/mp4',
        heroVideoDuration: 90,
        heroVideoWidth: 1920,
        heroVideoHeight: 1080,
        heroVideoBytes: 5_000_000,
        heroVideoCodec: 'h264/aac',
        heroVideoVersion: '2',
        heroVideoPosterUrl: 'https://res.cloudinary.com/test/image/upload/asset-1.jpg',
        heroVideoVerifiedAt: new Date(),
    };
    assert.equal(validateNativeHeroMovie(base).valid, true);
    const invalid = validateNativeHeroMovie({
        ...base,
        heroVideoCodec: 'vp9/vorbis',
        heroVideoBytes: Number.MAX_SAFE_INTEGER,
        heroVideoPosterUrl: '',
    });
    assert.ok(invalid.reasons.includes('unsupported-codec-pair'));
    assert.ok(invalid.reasons.includes('bytes-out-of-range'));
    assert.ok(invalid.reasons.includes('missing-video-poster'));
});

test('Hero runtime configuration rejects malformed or contract-breaking environment values', () => {
    assert.throws(
        () => validateHeroRuntimeConfig({
            HERO_VIDEO_MAX_BYTES: 'not-a-number',
        }),
        (error) => error.code === 'HERO_CONFIG_INVALID'
            && error.variable === 'HERO_VIDEO_MAX_BYTES',
    );
    assert.throws(
        () => validateHeroRuntimeConfig({
            HERO_REFRESH_TIMEZONE: 'Invalid/Timezone',
        }),
        (error) => error.variable === 'HERO_REFRESH_TIMEZONE',
    );
    assert.throws(
        () => validateHeroRuntimeConfig({
            HERO_REQUIRE_NATIVE_VIDEO: 'false',
        }),
        (error) => error.variable === 'HERO_REQUIRE_NATIVE_VIDEO',
    );
    assert.throws(
        () => validateHeroRuntimeConfig({
            HERO_REFRESH_LOCK_TTL_MS: '1',
        }),
        (error) => error.variable === 'HERO_REFRESH_LOCK_TTL_MS',
    );
    assert.throws(
        () => validateHeroRuntimeConfig({
            CACHE_HERO_ACTIVE_TTL_SECONDS: '999999999',
        }),
        (error) => error.variable === 'CACHE_HERO_ACTIVE_TTL_SECONDS',
    );
});

test('unknown operational refresh failures retry while known permanent validation failures do not', () => {
    assert.equal(shouldRetryHeroRefreshError(new Error('Mongo unavailable')), true);
    assert.equal(
        shouldRetryHeroRefreshError(new HeroRotationError('POOL_INVALID', 'Invalid pool.')),
        false,
    );
    assert.equal(
        shouldRetryHeroRefreshError(new HeroRotationError(
            'LOCK_LOST',
            'Lock lost.',
            { transient: true },
        )),
        true,
    );
    assert.equal(
        shouldRetryHeroRefreshError(new HeroRotationError(
            'CATALOG_UNAVAILABLE',
            'Catalog unavailable.',
            { status: 503, transient: true },
        )),
        true,
    );
});

test('If-None-Match supports weak and comma-separated semantic Hero ETags', () => {
    assert.equal(matchesHeroEtag('W/"other", W/"hero-abc"', '"hero-abc"'), true);
    assert.equal(matchesHeroEtag('*', '"hero-abc"'), true);
    assert.equal(matchesHeroEtag('"hero-other"', '"hero-abc"'), false);
});

test('manual Hero idempotency identity is stable across scheduling windows', () => {
    const first = getHeroRefreshRunIdentity({
        source: 'admin',
        requestedBy: 'admin-1',
        runId: 'release-native-2026-07',
        force: true,
        now: new Date('2026-07-29T00:00:00+07:00'),
    });
    const later = getHeroRefreshRunIdentity({
        source: 'admin',
        requestedBy: 'admin-1',
        runId: 'release-native-2026-07',
        force: true,
        now: new Date('2026-08-02T00:00:00+07:00'),
    });
    assert.equal(first.stableRunId, later.stableRunId);
    assert.equal(first.batchKey, later.batchKey);
    assert.match(first.batchKey, /^manual-[a-f0-9]{16}$/);
    assert.notEqual(first.window.key, later.window.key);
    assert.throws(
        () => getHeroRefreshRunIdentity({ runId: '../unsafe', force: true }),
        (error) => error.code === 'HERO_RUN_ID_INVALID' && error.transient === false,
    );
});

test('Hero ETag changes when scheduling metadata changes', () => {
    const payload = {
        batchId: 'batch-1',
        version: 1,
        generatedAt: '2026-07-29T00:00:00.000Z',
        nextRefreshAt: '2026-07-31T17:00:00.000Z',
        movies: [{ id: 'movie-1', heroVideoVersion: '1' }],
        settings: {
            heroSoundDefaultEnabled: false,
            heroDefaultVolume: 0.35,
        },
    };
    assert.notEqual(createHeroEtag({
        ...payload,
        nextRefreshAt: '2026-08-01T17:00:00.000Z',
    }), createHeroEtag(payload));
});

const poolMovie = (id, {
    popularity = 10,
    releaseDate = '2026-07-01',
} = {}) => ({
    _id: id,
    title: `Movie ${id}`,
    overview: `Overview ${id}`,
    poster_path: `/poster-${id}.jpg`,
    backdrop_path: `/backdrop-${id}.jpg`,
    release_date: releaseDate,
    vote_average: 8,
    vote_count: 1000,
    popularity,
    adult: false,
    runtime: 110,
    genres: [],
    heroVideoId: `hero_trailers/${id}/official`,
    heroVideoMovieId: id,
    heroVideoUrl: `https://res.cloudinary.com/test/video/upload/${id}.mp4`,
    heroVideoMimeType: 'video/mp4',
    heroVideoStatus: 'ready',
    heroVideoVersion: '1',
    heroVideoDuration: 90,
    heroVideoWidth: 1920,
    heroVideoHeight: 1080,
    heroVideoBytes: 5_000_000,
    heroVideoCodec: 'h264/aac',
    heroVideoPosterUrl: `https://res.cloudinary.com/test/image/upload/${id}.jpg`,
    heroVideoVerifiedAt: new Date('2026-07-01T00:00:00Z'),
});

test('catalog pool builder persists exact disjoint 5/5/5 groups and rejects an incomplete native set', async () => {
    const originalFind = Movie.find;
    const newest = Array.from({ length: 5 }, (_, index) => poolMovie(
        `new-${index}`,
        { popularity: 100 + index, releaseDate: `2026-08-0${index + 1}` },
    ));
    const hot = Array.from({ length: 5 }, (_, index) => poolMovie(
        `hot-${index}`,
        { popularity: 1000 - index },
    ));
    const discovery = Array.from({ length: 5 }, (_, index) => poolMovie(`discovery-${index}`));
    const candidates = [...newest, ...hot, ...discovery];
    const catalogBatch = {
        _id: 'catalog-1',
        status: 'active',
        version: 2,
        weekKey: '2026-W31',
        movieIds: candidates.map((movie) => movie._id),
        buckets: { newest: newest.map((movie) => movie._id) },
    };
    const setMovies = (value) => {
        Movie.find = () => ({
            select() {
                return this;
            },
            lean: async () => value,
        });
    };

    try {
        setMovies(candidates);
        const pool = await buildHeroPoolFromCatalog({
            catalogBatch,
            selectionSeed: 'pool-seed',
            previousBatch: null,
        });
        assert.equal(pool.movieIds.length, 15);
        assert.equal(new Set(pool.movieIds).size, 15);
        assert.equal(pool.newestMovieIds.length, 5);
        assert.equal(pool.hotMovieIds.length, 5);
        assert.equal(pool.discoveryMovieIds.length, 5);
        assert.equal(pool.activeHeroMovieIds.length, 5);
        assert.ok(pool.activeHeroMovieIds.some((id) => pool.newestMovieIds.includes(id)));
        assert.ok(pool.activeHeroMovieIds.some((id) => pool.hotMovieIds.includes(id)));
        assert.ok(pool.activeHeroMovieIds.some((id) => pool.discoveryMovieIds.includes(id)));

        setMovies([...candidates].reverse());
        const repeatedPool = await buildHeroPoolFromCatalog({
            catalogBatch,
            selectionSeed: 'pool-seed',
            previousBatch: null,
        });
        assert.deepEqual(repeatedPool.movieIds, pool.movieIds);
        assert.deepEqual(repeatedPool.activeHeroMovieIds, pool.activeHeroMovieIds);

        setMovies(candidates.map((movie) => (
            movie._id === 'discovery-4'
                ? { ...movie, heroVideoStatus: 'missing' }
                : movie
        )));
        await assert.rejects(
            buildHeroPoolFromCatalog({
                catalogBatch,
                selectionSeed: 'insufficient-seed',
                previousBatch: null,
            }),
            (error) => error.code === 'HERO_NATIVE_ASSETS_INSUFFICIENT',
        );

        const pendingPool = await buildHeroPoolFromCatalog({
            catalogBatch,
            selectionSeed: 'pending-seed',
            previousBatch: null,
            requireNative: false,
        });
        assert.equal(pendingPool.movieIds.length, 15);
        assert.equal(pendingPool.sourceMetadata.nativeRequired, false);
        assert.equal(pendingPool.sourceMetadata.validNativeMovieCount, 14);
    } finally {
        Movie.find = originalFind;
    }
});

test('activation preflight rejects a pool whose bound asset changed after selection', () => {
    const movies = [
        ...Array.from({ length: 5 }, (_, index) => poolMovie(`new-${index}`)),
        ...Array.from({ length: 5 }, (_, index) => poolMovie(`hot-${index}`)),
        ...Array.from({ length: 5 }, (_, index) => poolMovie(`discovery-${index}`)),
    ];
    const ids = movies.map((movie) => movie._id);
    assert.equal(assertHeroPoolAssetsReady({ movies, expectedMovieIds: ids }), true);
    assert.throws(
        () => assertHeroPoolAssetsReady({
            movies: movies.map((movie) => (
                movie._id === 'hot-2'
                    ? { ...movie, heroVideoStatus: 'missing' }
                    : movie
            )),
            expectedMovieIds: ids,
        }),
        (error) => error.code === 'HERO_POOL_ASSETS_CHANGED'
            && error.details.invalid.some((item) => item.movieId === 'hot-2'),
    );
});
