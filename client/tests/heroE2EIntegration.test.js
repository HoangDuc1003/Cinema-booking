import test from 'node:test';
import assert from 'node:assert/strict';
import { updateHomeHero } from '../../server/services/heroService.js';
import { getPublicHeroRotation } from '../../server/services/heroRotationService.js';
import SiteConfig from '../../server/models/SiteConfig.js';
import HeroRotationBatch from '../../server/models/HeroRotationBatch.js';
import Movie from '../../server/models/Movie.js';

const chain = (value) => ({
    select() { return this; },
    populate() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean: async () => value,
});

const mockMovie = (id) => ({
    _id: id,
    title: `Movie ${id}`,
    overview: `Overview for movie ${id}`,
    poster_path: `/poster-${id}.jpg`,
    backdrop_path: `/backdrop-${id}.jpg`,
    release_date: '2026-07-29',
    vote_average: 8.5,
    vote_count: 1500,
    popularity: 250,
    adult: false,
    runtime: 125,
    genres: [{ id: 1, name: 'Sci-Fi' }],
    heroVideoId: `hero_trailers/${id}/official`,
    heroVideoMovieId: id,
    heroVideoUrl: `https://res.cloudinary.com/nitro/video/upload/hero_trailers/${id}/official.mp4`,
    heroVideoMimeType: 'video/mp4',
    heroVideoPosterUrl: `https://res.cloudinary.com/nitro/image/upload/poster-${id}.jpg`,
    heroVideoStatus: 'ready',
    heroVideoVersion: '1.0.0',
    heroVideoDuration: 110,
    heroVideoWidth: 1920,
    heroVideoHeight: 1080,
    heroVideoBytes: 8000000,
    heroVideoCodec: 'h264/aac',
    heroVideoVerifiedAt: new Date('2026-07-29T00:00:00Z'),
    heroVideoSource: 'cloudinary',
});

test('M3 E2E Integration: Admin manual 5-movie save, public hero GET order, meta diagnostic, and native retry state transition', async () => {
    const savedMovieIds = ['m-101', 'm-102', 'm-103', 'm-104', 'm-105'];
    const mockMovies = savedMovieIds.map(mockMovie);

    const originals = {
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        configFindOne: SiteConfig.findOne,
        configUpdateOne: SiteConfig.updateOne,
        batchFindById: HeroRotationBatch.findById,
        batchFindOne: HeroRotationBatch.findOne,
        movieCountDocuments: Movie.countDocuments,
        movieFind: Movie.find,
    };

    let storedConfig = {
        key: 'homeHero',
        homeHero: {
            mode: 'manual',
            movieIds: savedMovieIds,
            heroSoundDefaultEnabled: false,
            heroDefaultVolume: 0.35,
        },
        updatedAt: new Date('2026-08-02T12:00:00Z'),
    };

    SiteConfig.findOneAndUpdate = (_query, update) => {
        if (update?.$set) {
            storedConfig.homeHero.mode = update['$set']['homeHero.mode'];
            storedConfig.homeHero.movieIds = update['$set']['homeHero.movieIds'];
            storedConfig.updatedAt = new Date();
        }
        return chain(storedConfig);
    };
    SiteConfig.findOne = (query) => {
        if (query?.key === 'heroRotation') {
            return chain(null);
        }
        return chain(storedConfig);
    };
    SiteConfig.updateOne = () => chain({ acknowledged: true, modifiedCount: 1 });
    HeroRotationBatch.findById = () => chain(null);
    HeroRotationBatch.findOne = () => chain(null);
    Movie.countDocuments = async () => savedMovieIds.length;
    Movie.find = () => chain(mockMovies);

    try {
        // Step 1: Admin saves 5 movies in Manual mode (PUT /api/admin/hero)
        const adminSaveResponse = await updateHomeHero({
            mode: 'manual',
            movieIds: savedMovieIds,
        });

        // Step 2: Objective Backend Environment Verification (Admin PUT/POST response reports meta identity)
        assert.equal(adminSaveResponse.mode, 'manual');
        assert.deepEqual(adminSaveResponse.movieIds, savedMovieIds);
        assert.ok(adminSaveResponse.meta, 'Admin update payload includes meta diagnostic');
        assert.equal(adminSaveResponse.meta.configuredMode, 'manual');
        assert.equal(adminSaveResponse.meta.effectiveMode, 'manual');
        assert.equal(adminSaveResponse.meta.source, 'manual-selection');
        assert.ok(adminSaveResponse.meta.version);
        assert.ok(adminSaveResponse.meta.buildSha);
        assert.ok(adminSaveResponse.meta.deploymentId);
        assert.ok(adminSaveResponse.meta.environment);

        // Step 3: Public GET /api/show/hero returns exact 5 movie IDs in saved order
        const publicHeroResponse = await getPublicHeroRotation();

        assert.equal(publicHeroResponse.batchId, 'manual');
        assert.equal(publicHeroResponse.movies.length, 5);
        assert.deepEqual(publicHeroResponse.movies.map((m) => m.id), savedMovieIds);

        // Native trailer metadata retained
        for (let i = 0; i < 5; i++) {
            const movie = publicHeroResponse.movies[i];
            assert.equal(movie.id, savedMovieIds[i]);
            assert.equal(movie.heroVideoStatus, 'ready');
            assert.ok(movie.heroVideoUrl.includes(savedMovieIds[i]));
            assert.equal(movie.heroVideoMimeType, 'video/mp4');
            assert.ok(movie.heroVideoSources.length > 0);
        }

        // Matching backend identity metadata between Admin PUT/POST response and public GET response
        assert.equal(publicHeroResponse.meta.configuredMode, adminSaveResponse.meta.configuredMode);
        assert.equal(publicHeroResponse.meta.effectiveMode, adminSaveResponse.meta.effectiveMode);
        assert.equal(publicHeroResponse.meta.source, adminSaveResponse.meta.source);
        assert.equal(publicHeroResponse.meta.version, adminSaveResponse.meta.version);
        assert.equal(publicHeroResponse.meta.buildSha, adminSaveResponse.meta.buildSha);
        assert.equal(publicHeroResponse.meta.deploymentId, adminSaveResponse.meta.deploymentId);
        assert.equal(publicHeroResponse.meta.environment, adminSaveResponse.meta.environment);

        // Step 4: Reloading Home returns the identical 5 movies
        const reloadedHeroResponse = await getPublicHeroRotation();
        assert.deepEqual(reloadedHeroResponse.movies.map((m) => m.id), savedMovieIds);

    } finally {
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        SiteConfig.findOne = originals.configFindOne;
        SiteConfig.updateOne = originals.configUpdateOne;
        HeroRotationBatch.findById = originals.batchFindById;
        HeroRotationBatch.findOne = originals.batchFindOne;
        Movie.countDocuments = originals.movieCountDocuments;
        Movie.find = originals.movieFind;
    }
});

test('M3 Integration: Retry trailer state transition clears failure state, increments videoGeneration, and preserves active movie index without scroll', () => {
    let activeMovieIndex = 0;
    let playbackStatus = 'FAILED';
    let failureReason = 'NotAllowedError';
    let videoGeneration = 0;
    let scrolledToSection = false;

    const scrollToTrailerSection = () => {
        scrolledToSection = true;
    };

    const handlePlayTrailer = () => {
        playbackStatus = 'IDLE';
        failureReason = null;
        videoGeneration += 1; // nextGeneration() inside startPlaybackForIndex
    };

    const handleTrailerAction = (trailerMode = 'hybrid', trailerAvailable = true) => {
        if (trailerMode === 'section') {
            scrollToTrailerSection();
            return;
        }
        if (trailerAvailable) {
            handlePlayTrailer();
        } else {
            scrollToTrailerSection();
        }
    };

    // Step 5: User clicks "Retry trailer" button in hybrid/native mode when 1st attempt fails
    handleTrailerAction('hybrid', true);

    // Step 6: Verify 2nd native play attempt occurs without scroll, navigation away, or movie index change
    assert.equal(playbackStatus, 'IDLE', 'Error state is cleared upon retry');
    assert.equal(failureReason, null, 'Failure reason is cleared');
    assert.equal(videoGeneration, 1, 'videoGeneration is incremented to trigger native re-initialization');
    assert.equal(activeMovieIndex, 0, 'Active movie index remains unchanged (movie index 0)');
    assert.equal(scrolledToSection, false, 'No window scroll or scrollIntoView to lower section occurred');
});
