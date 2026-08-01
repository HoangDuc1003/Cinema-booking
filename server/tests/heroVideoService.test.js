import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudinary } from '../configs/cloudinary.js';
import HeroRotationBatch from '../models/HeroRotationBatch.js';
import Movie from '../models/Movie.js';
import SiteConfig from '../models/SiteConfig.js';
import {
    commitHeroVideo,
    heroVideoRuntime,
    HeroVideoError,
    reconcileHeroAssets,
    removeHeroVideo,
    verifyUploadedHeroVideo,
} from '../services/heroVideoService.js';

const validAsset = (overrides = {}) => ({
    public_id: 'hero_trailers/42/official',
    resource_type: 'video',
    format: 'mp4',
    secure_url: 'https://res.cloudinary.com/demo/video/upload/hero_trailers/42/official.mp4',
    bytes: 5_000_000,
    duration: 90,
    width: 1920,
    height: 1080,
    video: { codec: 'h264' },
    audio: { codec: 'aac' },
    context: { custom: { movie_id: '42', attribution: 'Licensed test fixture' } },
    etag: 'asset-etag',
    ...overrides,
});

test('Cloudinary verification accepts only a decoded, movie-bound native asset', async () => {
    const originalResource = cloudinary.api.resource;
    const originalEnv = {
        name: process.env.CLOUDINARY_NAME,
        key: process.env.CLOUDINARY_API_KEY,
        secret: process.env.CLOUDINARY_SECRET_KEY,
    };
    process.env.CLOUDINARY_NAME = 'demo';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_SECRET_KEY = 'test-secret';
    try {
        cloudinary.api.resource = async () => validAsset();
        const verified = await verifyUploadedHeroVideo('42', 'hero_trailers/42/official');
        assert.equal(verified.movieId, '42');
        assert.equal(verified.mimeType, 'video/mp4');
        assert.equal(verified.codec, 'h264/aac');
        assert.equal(verified.width, 1920);
        assert.match(verified.posterUrl, /so_0,f_jpg,q_auto/);

        cloudinary.api.resource = async () => validAsset({ context: { custom: {} } });
        await assert.rejects(
            verifyUploadedHeroVideo('42', 'hero_trailers/42/official'),
            (error) => error instanceof HeroVideoError
                && error.code === 'HERO_VIDEO_CONTEXT_MISMATCH',
        );

        cloudinary.api.resource = async () => validAsset({ video: {} });
        await assert.rejects(
            verifyUploadedHeroVideo('42', 'hero_trailers/42/official'),
            (error) => error.code === 'HERO_VIDEO_CODEC_INVALID',
        );

        cloudinary.api.resource = async () => validAsset({ audio: {} });
        await assert.rejects(
            verifyUploadedHeroVideo('42', 'hero_trailers/42/official'),
            (error) => error.code === 'HERO_VIDEO_CODEC_INVALID',
        );

        cloudinary.api.resource = async () => validAsset({
            video: { codec: 'vp9' },
            audio: { codec: 'vorbis' },
        });
        await assert.rejects(
            verifyUploadedHeroVideo('42', 'hero_trailers/42/official'),
            (error) => error.code === 'HERO_VIDEO_CODEC_INVALID',
        );
    } finally {
        cloudinary.api.resource = originalResource;
        if (originalEnv.name === undefined) delete process.env.CLOUDINARY_NAME;
        else process.env.CLOUDINARY_NAME = originalEnv.name;
        if (originalEnv.key === undefined) delete process.env.CLOUDINARY_API_KEY;
        else process.env.CLOUDINARY_API_KEY = originalEnv.key;
        if (originalEnv.secret === undefined) delete process.env.CLOUDINARY_SECRET_KEY;
        else process.env.CLOUDINARY_SECRET_KEY = originalEnv.secret;
    }
});

const installMutationHarness = (t) => {
    const original = {
        configFindOne: SiteConfig.findOne,
        configUpdateOne: SiteConfig.updateOne,
        acquire: heroVideoRuntime.acquireFencedLock,
        verify: heroVideoRuntime.verifyFencedLock,
        renew: heroVideoRuntime.renewFencedLock,
        release: heroVideoRuntime.releaseFencedLock,
        deleteKeys: heroVideoRuntime.deleteKeys,
        deleteByPattern: heroVideoRuntime.deleteByPattern,
        activation: heroVideoRuntime.attemptActivation,
    };
    let lockHeld = false;
    SiteConfig.findOne = () => ({
        select() {
            return this;
        },
        lean: async () => ({ heroRotation: { lastFencingToken: 0 } }),
    });
    SiteConfig.updateOne = async () => ({ acknowledged: true, modifiedCount: 1 });
    heroVideoRuntime.acquireFencedLock = async () => {
        assert.equal(lockHeld, false);
        lockHeld = true;
        return { fencingToken: 1 };
    };
    heroVideoRuntime.verifyFencedLock = async () => lockHeld;
    heroVideoRuntime.renewFencedLock = async () => lockHeld;
    heroVideoRuntime.releaseFencedLock = async () => {
        assert.equal(lockHeld, true);
        lockHeld = false;
        return true;
    };
    heroVideoRuntime.deleteKeys = async () => 1;
    heroVideoRuntime.deleteByPattern = async () => 1;
    heroVideoRuntime.attemptActivation = async () => ({ activated: false, code: 'POOL_PENDING' });
    t.after(() => {
        SiteConfig.findOne = original.configFindOne;
        SiteConfig.updateOne = original.configUpdateOne;
        heroVideoRuntime.acquireFencedLock = original.acquire;
        heroVideoRuntime.verifyFencedLock = original.verify;
        heroVideoRuntime.renewFencedLock = original.renew;
        heroVideoRuntime.releaseFencedLock = original.release;
        heroVideoRuntime.deleteKeys = original.deleteKeys;
        heroVideoRuntime.deleteByPattern = original.deleteByPattern;
        heroVideoRuntime.attemptActivation = original.activation;
    });
    return {
        isLockHeld: () => lockHeld,
    };
};

const installCloudinaryEnv = (t) => {
    const previous = {
        name: process.env.CLOUDINARY_NAME,
        key: process.env.CLOUDINARY_API_KEY,
        secret: process.env.CLOUDINARY_SECRET_KEY,
    };
    process.env.CLOUDINARY_NAME = 'demo';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_SECRET_KEY = 'test-secret';
    t.after(() => {
        if (previous.name === undefined) delete process.env.CLOUDINARY_NAME;
        else process.env.CLOUDINARY_NAME = previous.name;
        if (previous.key === undefined) delete process.env.CLOUDINARY_API_KEY;
        else process.env.CLOUDINARY_API_KEY = previous.key;
        if (previous.secret === undefined) delete process.env.CLOUDINARY_SECRET_KEY;
        else process.env.CLOUDINARY_SECRET_KEY = previous.secret;
    });
};

test('commit verifies and persists the movie-specific asset while holding the shared Hero lock', async (t) => {
    installCloudinaryEnv(t);
    const harness = installMutationHarness(t);
    const original = {
        resource: cloudinary.api.resource,
        findById: Movie.findById,
        exists: Movie.exists,
    };
    const movie = {
        _id: '42',
        async save() {
            assert.equal(harness.isLockHeld(), true);
        },
    };
    cloudinary.api.resource = async () => {
        assert.equal(harness.isLockHeld(), true);
        return validAsset();
    };
    Movie.findById = async () => movie;
    Movie.exists = async () => false;
    t.after(() => {
        cloudinary.api.resource = original.resource;
        Movie.findById = original.findById;
        Movie.exists = original.exists;
    });

    const result = await commitHeroVideo('42', { publicId: 'hero_trailers/42/official' });
    assert.equal(harness.isLockHeld(), false);
    assert.equal(result.movie.heroVideoStatus, 'ready');
    assert.equal(result.movie.heroVideoMovieId, '42');
    assert.equal(result.movie.heroVideoCodec, 'h264/aac');
    assert.equal(result.activation.code, 'POOL_PENDING');
});

test('remove clears metadata and destroys Cloudinary media before releasing the shared Hero lock', async (t) => {
    const harness = installMutationHarness(t);
    const original = {
        destroy: cloudinary.uploader.destroy,
        activeFindOne: HeroRotationBatch.findOne,
        findById: Movie.findById,
    };
    const movie = {
        _id: '42',
        heroVideoId: 'hero_trailers/42/official',
        heroVideoStatus: 'ready',
        async save() {
            assert.equal(harness.isLockHeld(), true);
        },
    };
    HeroRotationBatch.findOne = () => ({
        select() {
            return this;
        },
        lean: async () => null,
    });
    Movie.findById = async () => movie;
    let destroyedWhileLocked = false;
    cloudinary.uploader.destroy = async (publicId) => {
        destroyedWhileLocked = harness.isLockHeld();
        assert.equal(publicId, 'hero_trailers/42/official');
        return { result: 'ok' };
    };
    t.after(() => {
        cloudinary.uploader.destroy = original.destroy;
        HeroRotationBatch.findOne = original.activeFindOne;
        Movie.findById = original.findById;
    });

    const result = await removeHeroVideo('42');
    assert.equal(destroyedWhileLocked, true);
    assert.equal(harness.isLockHeld(), false);
    assert.equal(result.heroVideoStatus, 'missing');
    assert.equal(result.heroVideoId, '');
});

test('reconciliation deletes only still-unreferenced assets and downgrades confirmed remote 404 references', async (t) => {
    installCloudinaryEnv(t);
    const harness = installMutationHarness(t);
    const original = {
        resources: cloudinary.api.resources,
        resource: cloudinary.api.resource,
        deleteResources: cloudinary.api.delete_resources,
        find: Movie.find,
        bulkWrite: Movie.bulkWrite,
    };
    cloudinary.api.resources = async () => ({
        resources: [{
            public_id: 'hero_trailers/orphan/old',
            created_at: '2020-01-01T00:00:00.000Z',
        }],
        next_cursor: null,
    });
    cloudinary.api.delete_resources = async (publicIds) => {
        assert.equal(harness.isLockHeld(), true);
        assert.deepEqual(publicIds, ['hero_trailers/orphan/old']);
        return { deleted: { 'hero_trailers/orphan/old': 'deleted' } };
    };
    cloudinary.api.resource = async (publicId) => {
        assert.equal(harness.isLockHeld(), true);
        assert.equal(publicId, 'hero_trailers/42/missing');
        const error = new Error('Not found');
        error.http_code = 404;
        throw error;
    };
    Movie.find = (query) => ({
        select() {
            return this;
        },
        lean: async () => (
            query.heroVideoStatus === 'ready'
                ? [{ _id: '42', heroVideoId: 'hero_trailers/42/missing' }]
                : []
        ),
    });
    let downgradeOperations = null;
    Movie.bulkWrite = async (operations) => {
        assert.equal(harness.isLockHeld(), true);
        downgradeOperations = operations;
        return { modifiedCount: operations.length };
    };
    t.after(() => {
        cloudinary.api.resources = original.resources;
        cloudinary.api.resource = original.resource;
        cloudinary.api.delete_resources = original.deleteResources;
        Movie.find = original.find;
        Movie.bulkWrite = original.bulkWrite;
    });

    const result = await reconcileHeroAssets();
    assert.equal(result.deletedCount, 1);
    assert.equal(result.missingReferencedCount, 1);
    assert.equal(harness.isLockHeld(), false);
    assert.equal(downgradeOperations[0].updateOne.filter.heroVideoId, 'hero_trailers/42/missing');
    assert.equal(downgradeOperations[0].updateOne.update.$set.heroVideoStatus, 'missing');
});
