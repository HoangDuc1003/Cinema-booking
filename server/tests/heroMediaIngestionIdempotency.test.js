import test from 'node:test';
import assert from 'node:assert/strict';
import HeroMediaAsset from '../models/HeroMediaAsset.js';
import Movie from '../models/Movie.js';
import {
    HERO_MEDIA_INGEST_LEASE_MS,
    heroMediaIngestionRuntime,
    ingestAuthorizedHeroMedia,
    requestHeroMediaSource,
    verifyIngestedHeroMedia,
} from '../services/heroMediaIngestionService.js';

process.env.HERO_MEDIA_AUTHORIZED_SOURCE_HOSTS = 'media.example.test';

const chain = (value) => ({
    select() { return this; },
    lean: async () => value,
});

const sourceAsset = (overrides = {}) => ({
    _id: 'asset-1',
    movieId: 'movie-1',
    sourceIdentity: 'a'.repeat(64),
    status: 'pending',
    sourceStatus: 'ready_for_ingestion',
    source: {
        type: 'AUTHORIZED_REMOTE_URL',
        provider: 'licensed',
        reference: 'trailer',
        originalUrl: 'https://media.example.test/trailers/movie-1.mp4',
        originalUrlHash: 'b'.repeat(64),
    },
    rights: {
        status: 'AUTHORIZED',
        approvedAt: new Date('2026-08-01T00:00:00Z'),
        approvedBy: 'admin-1',
        provenance: { license: 'fixture' },
    },
    ingestionAttempts: 1,
    ...overrides,
});

const requestInput = {
    movieId: 'movie-1',
    sourceType: 'AUTHORIZED_REMOTE_URL',
    sourceProvider: 'licensed',
    sourceReference: 'trailer',
    sourceUrl: 'https://media.example.test/trailers/movie-1.mp4',
    rightsStatus: 'AUTHORIZED',
    rightsConfirmed: true,
};

test('re-requesting an identical in-flight source reuses it without resetting ingestion state', async (t) => {
    const originals = {
        movieExists: Movie.exists,
        assetFindOne: HeroMediaAsset.findOne,
        assetFindOneAndUpdate: HeroMediaAsset.findOneAndUpdate,
    };
    Movie.exists = async () => ({ _id: 'movie-1' });
    HeroMediaAsset.findOne = () => chain(sourceAsset({ status: 'processing' }));
    HeroMediaAsset.findOneAndUpdate = () => assert.fail('an in-flight source must not be rewritten');
    t.after(() => {
        Movie.exists = originals.movieExists;
        HeroMediaAsset.findOne = originals.assetFindOne;
        HeroMediaAsset.findOneAndUpdate = originals.assetFindOneAndUpdate;
    });

    const result = await requestHeroMediaSource(requestInput);

    assert.equal(result.reused, true);
    assert.equal(result.asset.status, 'processing');
    assert.equal(result.asset.ingestionAttempts, 1);
    assert.equal(result.shouldEnqueue, true);
});

test('a fresh ingestion lease prevents a duplicate upload and exposes a bounded retry time', async (t) => {
    const now = new Date('2026-08-08T12:00:00Z');
    const asset = sourceAsset({ status: 'ingesting', lastIngestionAt: now });
    const originals = {
        findById: HeroMediaAsset.findById,
        findOneAndUpdate: HeroMediaAsset.findOneAndUpdate,
        now: heroMediaIngestionRuntime.now,
        upload: heroMediaIngestionRuntime.upload,
    };
    HeroMediaAsset.findById = () => chain(asset);
    HeroMediaAsset.findOneAndUpdate = () => assert.fail('a live lease must not be reclaimed');
    heroMediaIngestionRuntime.now = () => now;
    heroMediaIngestionRuntime.upload = () => assert.fail('a live lease must not upload');
    t.after(() => {
        HeroMediaAsset.findById = originals.findById;
        HeroMediaAsset.findOneAndUpdate = originals.findOneAndUpdate;
        heroMediaIngestionRuntime.now = originals.now;
        heroMediaIngestionRuntime.upload = originals.upload;
    });

    await assert.rejects(
        ingestAuthorizedHeroMedia({ assetId: asset._id }),
        (error) => error.code === 'HERO_MEDIA_INGESTION_LEASED'
            && error.transient === true
            && error.retryAfter.getTime() === now.getTime() + HERO_MEDIA_INGEST_LEASE_MS,
    );
});

test('a stale ingestion claim recovers a deterministic Cloudinary upload after a worker crash', async (t) => {
    const now = new Date('2026-08-08T12:10:00Z');
    const asset = sourceAsset({
        status: 'ingesting',
        lastIngestionAt: new Date(now.getTime() - HERO_MEDIA_INGEST_LEASE_MS - 1),
    });
    const expectedPublicId = 'hero_trailers/movie-1/remote-asset-1';
    const originals = {
        findById: HeroMediaAsset.findById,
        findOneAndUpdate: HeroMediaAsset.findOneAndUpdate,
        findByIdAndUpdate: HeroMediaAsset.findByIdAndUpdate,
        now: heroMediaIngestionRuntime.now,
        probe: heroMediaIngestionRuntime.probeRemoteSource,
        upload: heroMediaIngestionRuntime.upload,
        lookup: heroMediaIngestionRuntime.lookup,
    };
    let claimed = false;
    HeroMediaAsset.findById = () => chain(asset);
    HeroMediaAsset.findOneAndUpdate = (filter, update) => {
        assert.equal(filter.$or[1].status, 'ingesting');
        assert.equal(update.$inc.ingestionAttempts, 1);
        claimed = true;
        return chain({ ...asset, status: 'ingesting', lastIngestionAt: now });
    };
    HeroMediaAsset.findByIdAndUpdate = (_id, update) => chain({
        ...asset,
        status: update.$set.status,
        cloudinaryPublicId: update.$set.cloudinaryPublicId,
        verificationStatus: update.$set.verificationStatus,
    });
    heroMediaIngestionRuntime.now = () => now;
    heroMediaIngestionRuntime.probeRemoteSource = async (url) => url;
    heroMediaIngestionRuntime.upload = async () => {
        const error = new Error('worker crashed after Cloudinary accepted the upload');
        error.code = 'ECONNRESET';
        throw error;
    };
    heroMediaIngestionRuntime.lookup = async (publicId) => ({ public_id: publicId });
    t.after(() => {
        HeroMediaAsset.findById = originals.findById;
        HeroMediaAsset.findOneAndUpdate = originals.findOneAndUpdate;
        HeroMediaAsset.findByIdAndUpdate = originals.findByIdAndUpdate;
        heroMediaIngestionRuntime.now = originals.now;
        heroMediaIngestionRuntime.probeRemoteSource = originals.probe;
        heroMediaIngestionRuntime.upload = originals.upload;
        heroMediaIngestionRuntime.lookup = originals.lookup;
    });

    const result = await ingestAuthorizedHeroMedia({ assetId: asset._id });

    assert.equal(claimed, true);
    assert.equal(result.reused, true);
    assert.equal(result.shouldVerify, true);
    assert.equal(result.asset.status, 'processing');
    assert.equal(result.asset.id, asset._id);
    assert.equal(expectedPublicId, 'hero_trailers/movie-1/remote-asset-1');
});

test('a ready registry row repairs Movie projection on retry without re-verifying Cloudinary', async (t) => {
    const verifiedAt = new Date('2026-08-08T00:00:00Z');
    const asset = sourceAsset({
        status: 'ready',
        verificationStatus: 'verified',
        cloudinaryPublicId: 'hero_trailers/movie-1/official',
        secureUrl: 'https://res.cloudinary.com/test/video/upload/hero_trailers/movie-1/official.mp4',
        posterUrl: 'https://res.cloudinary.com/test/video/upload/so_0/movie-1.jpg',
        mimeType: 'video/mp4',
        duration: 90,
        width: 1920,
        height: 1080,
        bytes: 5_000_000,
        videoCodec: 'h264',
        audioCodec: 'aac',
        checksum: 'checksum-1',
        attribution: 'Licensed fixture',
        verifiedAt,
    });
    const originals = {
        findById: HeroMediaAsset.findById,
        movieFindOneAndUpdate: Movie.findOneAndUpdate,
        verify: heroMediaIngestionRuntime.verify,
        reconcile: heroMediaIngestionRuntime.reconcile,
    };
    let movieUpdate = null;
    HeroMediaAsset.findById = () => chain(asset);
    Movie.findOneAndUpdate = async (_filter, update) => {
        movieUpdate = update.$set;
        return { _id: 'movie-1' };
    };
    heroMediaIngestionRuntime.verify = () => assert.fail('ready rows must not reverify Cloudinary');
    heroMediaIngestionRuntime.reconcile = async () => ({ status: 'NO_PREPARING_BATCH' });
    t.after(() => {
        HeroMediaAsset.findById = originals.findById;
        Movie.findOneAndUpdate = originals.movieFindOneAndUpdate;
        heroMediaIngestionRuntime.verify = originals.verify;
        heroMediaIngestionRuntime.reconcile = originals.reconcile;
    });

    const result = await verifyIngestedHeroMedia({ assetId: asset._id });

    assert.equal(result.reused, true);
    assert.equal(result.activation.status, 'NO_PREPARING_BATCH');
    assert.equal(movieUpdate.heroVideoStatus, 'ready');
    assert.equal(movieUpdate.heroVideoMovieId, 'movie-1');
    assert.equal(movieUpdate.heroVideoVersion, String(verifiedAt.getTime()));
});

test('a transient verification failure remains processing so the Inngest retry can verify again', async (t) => {
    const asset = sourceAsset({
        status: 'processing',
        verificationStatus: 'processing',
        cloudinaryPublicId: 'hero_trailers/movie-1/official',
    });
    const originals = {
        findById: HeroMediaAsset.findById,
        findByIdAndUpdate: HeroMediaAsset.findByIdAndUpdate,
        verify: heroMediaIngestionRuntime.verify,
    };
    let retryUpdate = null;
    HeroMediaAsset.findById = () => chain(asset);
    HeroMediaAsset.findByIdAndUpdate = (_id, update) => {
        retryUpdate = update.$set;
        return chain({ ...asset, ...update.$set });
    };
    heroMediaIngestionRuntime.verify = async () => {
        const error = new Error('Cloudinary verification timed out');
        error.code = 'ETIMEDOUT';
        throw error;
    };
    t.after(() => {
        HeroMediaAsset.findById = originals.findById;
        HeroMediaAsset.findByIdAndUpdate = originals.findByIdAndUpdate;
        heroMediaIngestionRuntime.verify = originals.verify;
    });

    await assert.rejects(
        verifyIngestedHeroMedia({ assetId: asset._id, reconcile: false }),
        (error) => error.transient === true && error.asset?.status === 'processing',
    );

    assert.equal(retryUpdate.status, 'processing');
    assert.equal(retryUpdate.verificationStatus, 'processing');
    assert.equal(retryUpdate.failure.transient, true);
});
