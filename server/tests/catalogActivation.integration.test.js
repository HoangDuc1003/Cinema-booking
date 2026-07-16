import test from 'node:test';
import assert from 'node:assert/strict';

const testUri = process.env.TEST_MONGODB_URI || '';
const enabled = process.env.ALLOW_INTEGRATION_TESTS === 'true'
    && Boolean(testUri)
    && /(?:localhost|127\.0\.0\.1|test)/i.test(testUri);

const movieFixture = (id) => ({
    _id: id,
    title: `Catalog movie ${id}`,
    overview: `Overview for ${id}`,
    poster_path: `/poster-${id}.jpg`,
    backdrop_path: `/backdrop-${id}.jpg`,
    release_date: '2024-01-01',
    original_language: 'en',
    tagline: '',
    genres: [],
    casts: [],
    vote_average: 7,
    runtime: 120,
});

test('catalog activation preserves historical Movie, Show and Booking documents', { skip: !enabled }, async () => {
    const [
        { default: mongoose },
        { default: CatalogBatch },
        { default: SiteConfig },
        { default: Movie },
        { default: Show },
        { default: Booking },
        { activateCatalogBatch, catalogRefreshTestHooks },
        { resolveFavoriteMovies },
    ] = await Promise.all([
        import('mongoose'),
        import('../models/CatalogBatch.js'),
        import('../models/SiteConfig.js'),
        import('../models/Movie.js'),
        import('../models/Show.js'),
        import('../models/Booking.js'),
        import('../services/catalogRefreshService.js'),
        import('../controllers/userController.js'),
    ]);

    process.env.MONGODB_URI = testUri;
    await mongoose.connect(testUri);
    await Promise.all([
        CatalogBatch.init(),
        SiteConfig.init(),
        Movie.init(),
        Show.init(),
        Booking.init(),
    ]);

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const runId = `catalog-integration-${suffix}`;
    const weekKey = `2099-W${String(Math.floor(Math.random() * 50) + 1).padStart(2, '0')}`;
    const movieIds = Array.from({ length: 150 }, (_, index) => `${runId}-${index}`);
    const movies = movieIds.map(movieFixture);
    const faultMovieIds = [];
    const faultRunIds = [];
    const historicalMovieId = `historical-${suffix}`;
    let show;
    let booking;
    let batch;

    try {
        await Movie.create({
            ...movieFixture(historicalMovieId),
            heroVideoUrl: 'https://cdn.example.test/protected.mp4',
            heroVideoStatus: 'ready',
        });
        show = await Show.create({
            movie: historicalMovieId,
            showDateTime: new Date(Date.now() + 86400000),
            showPrice: 12,
            hall: runId,
        });
        booking = await Booking.create({
            user: `user-${suffix}`,
            show: show._id,
            amount: 12,
            bookedSeats: ['A1'],
            holdExpiresAt: new Date(Date.now() + 1800000),
        });
        await SiteConfig.create({
            key: 'homeHero',
            homeHero: { mode: 'manual', movieIds: [historicalMovieId, movieIds[0]] },
        });
        batch = await catalogRefreshTestHooks.allocateVersionedBatch({ weekKey, runId, fencingToken: 1, source: 'admin' });
        const idempotentBatch = await catalogRefreshTestHooks.allocateVersionedBatch({ weekKey, runId, fencingToken: 1, source: 'admin' });
        assert.equal(String(idempotentBatch._id), String(batch._id));
        const allocationRunId = `${runId}-version-2`;
        faultRunIds.push(allocationRunId);
        const secondVersion = await catalogRefreshTestHooks.allocateVersionedBatch({
            weekKey,
            runId: allocationRunId,
            fencingToken: 2,
            source: 'admin',
        });
        assert.equal(secondVersion.version, batch.version + 1);
        secondVersion.status = 'failed';
        secondVersion.failureReason = 'INTEGRATION_VERSION_GUARD';
        await secondVersion.save();

        batch.buckets = {
            newest: movieIds.slice(0, 50),
            popular: movieIds.slice(50, 100),
            classics: movieIds.slice(100, 150),
        };
        batch.movieIds = movieIds;
        batch.validatedAt = new Date();
        batch.status = 'staging';
        await batch.save();

        const createLock = (fencingToken) => ({
            client: {
                isReady: true,
                get: async (key) => key === 'catalog:test:fence' ? String(fencingToken) : `owner:${fencingToken}`,
            },
            key: 'catalog:test:lease',
            fenceKey: 'catalog:test:fence',
            value: `owner:${fencingToken}`,
            fencingToken,
        });

        await activateCatalogBatch(batch._id, movies, { lock: createLock(1), now: new Date('2099-01-05T01:00:00.000Z') });

        const activeBatch = await CatalogBatch.findById(batch._id).lean();
        assert.equal(activeBatch.status, 'active');
        assert.equal(activeBatch.movieIds.length, 150);
        assert.equal(new Set(activeBatch.movieIds).size, 150);
        assert.equal(await Movie.countDocuments({ _id: { $in: activeBatch.movieIds } }), 150);
        assert.ok(await Movie.countDocuments() >= 151);
        assert.ok(await Movie.exists({ _id: historicalMovieId }));
        assert.ok(await Show.exists({ _id: show._id, movie: historicalMovieId }));
        assert.ok(await Booking.exists({ _id: booking._id, show: show._id }));
        const manualHero = await SiteConfig.findOne({ key: 'homeHero' }).lean();
        assert.equal(manualHero.homeHero.mode, 'manual');
        assert.deepEqual(manualHero.homeHero.movieIds, [historicalMovieId, movieIds[0]]);
        const favorites = await resolveFavoriteMovies(`user-${suffix}`, {
            getUser: async () => ({ privateMetadata: { favorites: [historicalMovieId] } }),
        });
        assert.deepEqual(favorites.map((movie) => String(movie._id)), [historicalMovieId]);

        const phases = [
            'after-movie-upsert',
            'after-retire-active',
            'after-activate-batch',
            'after-site-config-update',
            'before-commit',
        ];
        for (const [phaseIndex, phase] of phases.entries()) {
            const faultRunId = `${runId}-fault-${phaseIndex}`;
            const ids = Array.from({ length: 150 }, (_, index) => `${faultRunId}-${index}`);
            faultRunIds.push(faultRunId);
            faultMovieIds.push(...ids);
            const faultBatch = await CatalogBatch.create({
                weekKey,
                version: batch.version + phaseIndex + 2,
                runId: faultRunId,
                fencingToken: 2,
                status: 'staging',
                buckets: {
                    newest: ids.slice(0, 50),
                    popular: ids.slice(50, 100),
                    classics: ids.slice(100, 150),
                },
                movieIds: ids,
                generatedAt: new Date(),
                validatedAt: new Date(),
            });
            await assert.rejects(
                activateCatalogBatch(faultBatch._id, ids.map(movieFixture), {
                    lock: createLock(2),
                    faultInjector: async (currentPhase) => {
                        if (currentPhase === phase) throw new Error(`FAULT:${phase}`);
                    },
                }),
                new RegExp(`FAULT:${phase}`),
            );
            assert.equal((await CatalogBatch.findById(faultBatch._id).lean()).status, 'staging');
            assert.equal(String((await CatalogBatch.findOne({ status: 'active' }).lean())._id), String(batch._id));
            assert.equal(await Movie.countDocuments({ _id: { $in: ids } }), 0);
            const config = await SiteConfig.findOne({ key: 'catalog' }).lean();
            assert.equal(String(config.catalog.activeBatchId), String(batch._id));
            assert.equal(config.catalog.lastFencingToken, 1);
        }
    } finally {
        if (booking?._id) await Booking.deleteOne({ _id: booking._id });
        if (show?._id) await Show.deleteOne({ _id: show._id });
        await Movie.deleteMany({ _id: { $in: [...movieIds, ...faultMovieIds, historicalMovieId] } });
        await CatalogBatch.deleteMany({ runId: { $in: [runId, ...faultRunIds] } });
        await SiteConfig.deleteOne({ key: 'catalog', 'catalog.lastFencingToken': 1 });
        await SiteConfig.deleteOne({ key: 'homeHero', 'homeHero.movieIds': historicalMovieId });
        await mongoose.disconnect();
    }
});
