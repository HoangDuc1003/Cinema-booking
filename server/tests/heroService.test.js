import test from 'node:test';
import assert from 'node:assert/strict';
import HeroRotationBatch from '../models/HeroRotationBatch.js';
import Movie from '../models/Movie.js';
import SiteConfig from '../models/SiteConfig.js';
import { getPublicHomeHero } from '../services/heroService.js';
import { createHeroEtag } from '../services/heroRotationService.js';

const nativeMovie = (id) => ({
    _id: id,
    title: `Movie ${id}`,
    overview: `Overview ${id}`,
    poster_path: `/poster-${id}.jpg`,
    backdrop_path: `/backdrop-${id}.jpg`,
    release_date: '2026-07-01',
    vote_average: 8,
    vote_count: 1000,
    popularity: 100,
    adult: false,
    runtime: 120,
    genres: [{ id: 1, name: 'Action' }],
    heroVideoId: `hero_trailers/${id}/official`,
    heroVideoMovieId: id,
    heroVideoUrl: `https://res.cloudinary.com/test/video/upload/hero_trailers/${id}/official.mp4`,
    heroVideoMimeType: 'video/mp4',
    heroVideoPosterUrl: `https://res.cloudinary.com/test/image/upload/poster-${id}.jpg`,
    heroVideoStatus: 'ready',
    heroVideoVersion: '1',
    heroVideoDuration: 90,
    heroVideoWidth: 1920,
    heroVideoHeight: 1080,
    heroVideoBytes: 5_000_000,
    heroVideoCodec: 'h264/aac',
    heroVideoVerifiedAt: new Date('2026-07-01T00:00:00Z'),
    heroVideoSource: 'cloudinary',
});

const chain = (value) => ({
    select() {
        return this;
    },
    sort() {
        return this;
    },
    limit() {
        return this;
    },
    lean: async () => value,
});

test('active Hero batch is server-authoritative, preserves order, and ignores heroOffset', async () => {
    const originals = {
        configFindOne: SiteConfig.findOne,
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        batchFindById: HeroRotationBatch.findById,
        batchFindOne: HeroRotationBatch.findOne,
        movieFind: Movie.find,
    };
    const ids = ['new-1', 'hot-1', 'discovery-1', 'hot-2', 'new-2'];
    const movies = ids.map(nativeMovie).reverse();
    SiteConfig.findOne = () => chain({ heroRotation: { activeBatchId: 'batch-1' } });
    SiteConfig.findOneAndUpdate = () => chain({
        homeHero: {
            mode: 'manual',
            movieIds: ['legacy-1'],
            heroSoundDefaultEnabled: true,
            heroDefaultVolume: 0.35,
        },
        updatedAt: new Date('2026-07-01T00:00:00Z'),
    });
    HeroRotationBatch.findById = () => chain({
        _id: 'batch-1',
        status: 'active',
        batchKey: 'hero-2026-07-01',
        version: 3,
        generatedAt: new Date('2026-07-01T00:00:00Z'),
        activatedAt: new Date('2026-07-01T00:00:00Z'),
        nextRefreshAt: new Date('2026-07-03T00:00:00Z'),
        timezone: 'Asia/Ho_Chi_Minh',
        activeHeroMovieIds: ids,
    });
    HeroRotationBatch.findOne = () => chain(null);
    Movie.find = () => chain(movies);
    try {
        const first = await getPublicHomeHero({ heroOffset: 1 });
        const second = await getPublicHomeHero({ heroOffset: 999 });
        assert.equal(first.movies.length, 5);
        assert.deepEqual(first.movies.map((movie) => movie.id), ids);
        assert.deepEqual(second.movies.map((movie) => movie.id), ids);
        assert.equal(first.settings.effectiveMode, 'auto');
        assert.equal(first.settings.heroSoundDefaultEnabled, true);
        assert.equal(first.batchId, 'batch-1');
        assert.equal(first.version, 3);
        assert.ok(first.movies.every((movie) => movie.heroVideoSources.length === 1));
        assert.ok(first.movies.every((movie) => !('heroVideoId' in movie)));
    } finally {
        SiteConfig.findOne = originals.configFindOne;
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        HeroRotationBatch.findById = originals.batchFindById;
        HeroRotationBatch.findOne = originals.batchFindOne;
        Movie.find = originals.movieFind;
    }
});

test('missing active batch returns five ordered posters and never exposes mock/generic media as playable', async () => {
    const originals = {
        configFindOne: SiteConfig.findOne,
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        batchFindOne: HeroRotationBatch.findOne,
        movieFind: Movie.find,
    };
    const ids = ['legacy-3', 'legacy-1', 'legacy-5', 'legacy-2', 'legacy-4'];
    const movies = ids.map((id) => ({
        ...nativeMovie(id),
        heroVideoUrl: '/mock/hero-trailer.mp4',
        heroVideoId: 'hero_trailers/cinematic_universal_loop_1',
    })).reverse();
    SiteConfig.findOne = () => chain(null);
    SiteConfig.findOneAndUpdate = () => chain({
        homeHero: {
            mode: 'manual',
            movieIds: ids,
            heroSoundDefaultEnabled: false,
            heroDefaultVolume: 0.35,
        },
        updatedAt: new Date('2026-07-01T00:00:00Z'),
    });
    HeroRotationBatch.findOne = () => chain(null);
    Movie.find = () => chain(movies);
    try {
        const payload = await getPublicHomeHero({ now: new Date('2026-07-02T00:00:00+07:00') });
        assert.equal(payload.cache, 'fallback');
        assert.equal(payload.settings.effectiveMode, 'poster-only');
        assert.deepEqual(payload.movies.map((movie) => movie.id), ids);
        assert.ok(payload.movies.every((movie) => movie.heroVideoUrl === ''));
        assert.ok(payload.movies.every((movie) => movie.heroVideoSources.length === 0));
        assert.ok(payload.movies.every((movie) => movie.heroVideoStatus === 'poster-only'));
    } finally {
        SiteConfig.findOne = originals.configFindOne;
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        HeroRotationBatch.findOne = originals.batchFindOne;
        Movie.find = originals.movieFind;
    }
});

test('semantic Hero ETag changes for movie order, video version, and sound settings', () => {
    const base = {
        batchId: 'batch-1',
        version: 1,
        movies: [
            { id: 'a', heroVideoVersion: '1' },
            { id: 'b', heroVideoVersion: '1' },
        ],
        settings: {
            heroSoundDefaultEnabled: false,
            heroDefaultVolume: 0.35,
            updatedAt: '2026-07-01T00:00:00Z',
        },
    };
    const original = createHeroEtag(base);
    assert.notEqual(createHeroEtag({ ...base, movies: [...base.movies].reverse() }), original);
    assert.notEqual(createHeroEtag({
        ...base,
        movies: [{ id: 'a', heroVideoVersion: '2' }, base.movies[1]],
    }), original);
    assert.notEqual(createHeroEtag({
        ...base,
        settings: { ...base.settings, heroSoundDefaultEnabled: true },
    }), original);
});
