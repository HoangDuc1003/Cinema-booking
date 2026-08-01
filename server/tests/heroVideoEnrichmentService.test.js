import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudinary } from '../configs/cloudinary.js';
import CatalogBatch from '../models/CatalogBatch.js';
import Movie from '../models/Movie.js';
import SiteConfig from '../models/SiteConfig.js';
import {
    heroVideoRuntime,
} from '../services/heroVideoService.js';
import { enrichCatalogHeroVideos } from '../services/heroVideoEnrichmentService.js';

const envKeys = [
    'CLOUDINARY_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_SECRET_KEY',
];

const asset = (movieId) => ({
    public_id: `hero_trailers/${movieId}/official`,
    resource_type: 'video',
    format: 'mp4',
    secure_url: `https://res.cloudinary.com/test/video/upload/hero_trailers/${movieId}/official.mp4`,
    bytes: 4_000_000,
    duration: 90,
    width: 1920,
    height: 1080,
    video: { codec: 'h264' },
    audio: { codec: 'aac' },
    context: { custom: { movie_id: movieId, attribution: 'Licensed fixture' } },
    etag: `etag-${movieId}`,
    created_at: '2026-07-01T00:00:00Z',
});

test('enrichment refuses to fabricate generic trailers when Cloudinary verification is unavailable', async () => {
    const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    envKeys.forEach((key) => delete process.env[key]);
    try {
        await assert.rejects(
            enrichCatalogHeroVideos({ movieIds: ['101'] }),
            (error) => error.code === 'CLOUDINARY_NOT_CONFIGURED' && error.status === 503,
        );
    } finally {
        envKeys.forEach((key) => {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        });
    }
});

test('enrichment promotes only verified movie-specific assets and records native metadata', async () => {
    const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    envKeys.forEach((key) => {
        process.env[key] = `test-${key.toLowerCase()}`;
    });
    const originals = {
        resources: cloudinary.api.resources,
        resource: cloudinary.api.resource,
        batchFindOne: CatalogBatch.findOne,
        movieFind: Movie.find,
        bulkWrite: Movie.bulkWrite,
        configFindOne: SiteConfig.findOne,
        configUpdateOne: SiteConfig.updateOne,
        acquireFencedLock: heroVideoRuntime.acquireFencedLock,
        verifyFencedLock: heroVideoRuntime.verifyFencedLock,
        renewFencedLock: heroVideoRuntime.renewFencedLock,
        releaseFencedLock: heroVideoRuntime.releaseFencedLock,
        attemptActivation: heroVideoRuntime.attemptActivation,
        deleteKeys: heroVideoRuntime.deleteKeys,
        deleteByPattern: heroVideoRuntime.deleteByPattern,
    };
    const assets = [asset('101'), asset('102'), {
        ...asset('generic'),
        public_id: 'hero_trailers/cinematic_universal_loop_1',
    }];
    let bulkOperations = null;
    cloudinary.api.resources = async () => ({ resources: assets, next_cursor: null });
    cloudinary.api.resource = async (publicId) => assets.find((entry) => entry.public_id === publicId);
    CatalogBatch.findOne = () => ({
        lean: async () => ({
            _id: 'catalog-1',
            status: 'active',
            movieIds: ['101', '102', '103'],
        }),
    });
    Movie.find = () => ({
        select() {
            return this;
        },
        lean: async () => [
            { _id: '101', heroVideoStatus: 'missing' },
            { _id: '102', heroVideoStatus: 'missing' },
            { _id: '103', heroVideoStatus: 'missing' },
        ],
    });
    Movie.bulkWrite = async (operations) => {
        bulkOperations = operations;
        return { modifiedCount: operations.length };
    };
    SiteConfig.findOne = () => ({
        select() {
            return this;
        },
        lean: async () => ({ heroRotation: { lastFencingToken: 0 } }),
    });
    SiteConfig.updateOne = async () => ({ acknowledged: true, modifiedCount: 1 });
    const lock = { fencingToken: 1 };
    heroVideoRuntime.acquireFencedLock = async () => lock;
    heroVideoRuntime.verifyFencedLock = async () => true;
    heroVideoRuntime.renewFencedLock = async () => true;
    heroVideoRuntime.releaseFencedLock = async () => true;
    let activationOptions = null;
    heroVideoRuntime.attemptActivation = async (options) => {
        activationOptions = options;
        return { status: 'pending', reason: 'test' };
    };
    heroVideoRuntime.deleteKeys = async () => 1;
    heroVideoRuntime.deleteByPattern = async () => 1;
    try {
        const result = await enrichCatalogHeroVideos();
        assert.equal(result.success, false);
        assert.equal(result.verifiedCount, 2);
        assert.deepEqual(activationOptions, {
            source: 'enrichment',
            requestedBy: 'catalog-hero-enrichment',
        });
        assert.deepEqual(result.activation, { status: 'pending', reason: 'test' });
        assert.deepEqual(result.missingMovieIds, ['103']);
        assert.equal(bulkOperations.length, 2);
        for (const operation of bulkOperations) {
            const update = operation.updateOne.update.$set;
            assert.equal(update.heroVideoStatus, 'ready');
            assert.equal(update.heroVideoMovieId, operation.updateOne.filter._id);
            assert.equal(update.heroVideoStorageProvider, 'cloudinary');
            assert.ok(update.heroVideoUrl.startsWith('https://res.cloudinary.com/'));
            assert.equal(update.heroVideoDuration, 90);
            assert.equal(update.heroVideoWidth, 1920);
            assert.equal(update.heroVideoHeight, 1080);
            assert.equal(update.heroVideoBytes, 4_000_000);
        }
        assert.equal(
            bulkOperations.some((operation) => (
                operation.updateOne.update.$set.heroVideoId.includes('cinematic_universal_loop')
            )),
            false,
        );

        cloudinary.api.resource = async () => {
            throw new Error('Cloudinary network unavailable');
        };
        await assert.rejects(
            enrichCatalogHeroVideos({ force: true }),
            /Cloudinary network unavailable/,
        );
    } finally {
        cloudinary.api.resources = originals.resources;
        cloudinary.api.resource = originals.resource;
        CatalogBatch.findOne = originals.batchFindOne;
        Movie.find = originals.movieFind;
        Movie.bulkWrite = originals.bulkWrite;
        SiteConfig.findOne = originals.configFindOne;
        SiteConfig.updateOne = originals.configUpdateOne;
        heroVideoRuntime.acquireFencedLock = originals.acquireFencedLock;
        heroVideoRuntime.verifyFencedLock = originals.verifyFencedLock;
        heroVideoRuntime.renewFencedLock = originals.renewFencedLock;
        heroVideoRuntime.releaseFencedLock = originals.releaseFencedLock;
        heroVideoRuntime.attemptActivation = originals.attemptActivation;
        heroVideoRuntime.deleteKeys = originals.deleteKeys;
        heroVideoRuntime.deleteByPattern = originals.deleteByPattern;
        envKeys.forEach((key) => {
            if (previousEnv[key] === undefined) delete process.env[key];
            else process.env[key] = previousEnv[key];
        });
    }
});
