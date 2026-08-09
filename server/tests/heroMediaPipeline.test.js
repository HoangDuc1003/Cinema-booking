import test from 'node:test';
import assert from 'node:assert/strict';
import HeroMediaAsset from '../models/HeroMediaAsset.js';
import HeroRotationBatch from '../models/HeroRotationBatch.js';
import Movie from '../models/Movie.js';
import SiteConfig from '../models/SiteConfig.js';
import {
    ingestAuthorizedHeroMedia,
    heroMediaIngestionRuntime,
    requestHeroMediaSource,
} from '../services/heroMediaIngestionService.js';
import { recordVerifiedHeroMediaAsset } from '../services/heroMediaAssetService.js';
import {
    assertAuthorizedRemoteSourceNetworkSafe,
    assertMediaSourceMayIngest,
    resolveMediaSource,
} from '../services/mediaSourceResolver.js';
import {
    getHeroPoolReadiness,
    heroRotationRuntime,
    reconcilePreparingHeroBatches,
} from '../services/heroRotationService.js';

// The application reads this allowlist only from server environment, never
// from an Admin request body. The test value is a public fixture hostname.
process.env.HERO_MEDIA_AUTHORIZED_SOURCE_HOSTS = 'media.example.test';

const chain = (value) => ({
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    session() { return this; },
    lean: async () => value,
});

const nativeMovie = (id) => ({
    _id: id,
    title: `Movie ${id}`,
    overview: 'Overview',
    poster_path: `/poster-${id}.jpg`,
    backdrop_path: `/backdrop-${id}.jpg`,
    release_date: '2026-08-01',
    vote_average: 8,
    vote_count: 1000,
    popularity: 100,
    adult: false,
    runtime: 120,
    genres: [],
    heroVideoId: `hero_trailers/${id}/official`,
    heroVideoMovieId: id,
    heroVideoUrl: `https://res.cloudinary.com/test/video/upload/hero_trailers/${id}/official.mp4`,
    heroVideoMimeType: 'video/mp4',
    heroVideoPosterUrl: `https://res.cloudinary.com/test/image/upload/${id}.jpg`,
    heroVideoStatus: 'ready',
    heroVideoVersion: '1',
    heroVideoDuration: 90,
    heroVideoWidth: 1920,
    heroVideoHeight: 1080,
    heroVideoBytes: 5_000_000,
    heroVideoCodec: 'h264/aac',
    heroVideoVerifiedAt: new Date('2026-08-01T00:00:00Z'),
});

const pool = () => ({
    newestMovieIds: Array.from({ length: 5 }, (_, index) => `new-${index}`),
    hotMovieIds: Array.from({ length: 5 }, (_, index) => `hot-${index}`),
    discoveryMovieIds: Array.from({ length: 5 }, (_, index) => `discovery-${index}`),
});

test('source policy accepts an approved public HTTPS media URL and refuses unknown or YouTube-only sources', () => {
    const approved = resolveMediaSource({
        movieId: 'movie-1',
        sourceType: 'AUTHORIZED_REMOTE_URL',
        sourceProvider: 'licensed-cdn',
        sourceUrl: 'https://media.example.test/trailers/movie-1.mp4',
        rightsStatus: 'AUTHORIZED',
        authorizedSourceHosts: ['media.example.test'],
    });
    assert.equal(approved.ingestionAllowed, true);
    assert.match(approved.originalUrlHash, /^[a-f0-9]{64}$/);
    assert.equal(assertMediaSourceMayIngest(approved), true);

    const youtube = resolveMediaSource({
        movieId: 'movie-1',
        sourceType: 'YOUTUBE_REFERENCE_ONLY',
        sourceReference: 'abc123',
        rightsStatus: 'UNKNOWN',
    });
    assert.equal(youtube.downloadableUrl, '');
    assert.equal(youtube.sourceStatus, 'needs_authorized_source');
    assert.throws(() => assertMediaSourceMayIngest(youtube), /Only explicitly authorized/);

    const unknown = resolveMediaSource({
        movieId: 'movie-1',
        sourceType: 'AUTHORIZED_REMOTE_URL',
        sourceUrl: 'https://media.example.test/trailers/movie-1.mp4',
        rightsStatus: 'UNKNOWN',
        authorizedSourceHosts: ['media.example.test'],
    });
    assert.throws(() => assertMediaSourceMayIngest(unknown), /Only explicitly authorized/);
});

test('remote source network safety rejects private DNS answers and redirects before Cloudinary can fetch them', async () => {
    const input = 'https://media.example.test/trailers/movie-1.mp4';
    await assert.rejects(
        assertAuthorizedRemoteSourceNetworkSafe(input, {
            authorizedSourceHosts: ['media.example.test'],
            lookupFn: async () => [{ address: '127.0.0.1', family: 4 }],
            fetchFn: async () => assert.fail('unsafe DNS must not be fetched'),
        }),
        (error) => error.code === 'HERO_MEDIA_SOURCE_NETWORK_UNSAFE',
    );
    await assert.rejects(
        assertAuthorizedRemoteSourceNetworkSafe(input, {
            authorizedSourceHosts: ['media.example.test'],
            lookupFn: async () => [{ address: '203.0.113.7', family: 4 }],
            fetchFn: async () => ({ status: 302 }),
        }),
        (error) => error.code === 'HERO_MEDIA_SOURCE_REDIRECT_REJECTED',
    );
    const probeRequests = [];
    await assert.rejects(
        assertAuthorizedRemoteSourceNetworkSafe(input, {
            authorizedSourceHosts: ['media.example.test'],
            lookupFn: async () => [{ address: '203.0.113.7', family: 4 }],
            fetchFn: async (_url, options) => {
                probeRequests.push(options);
                return { status: probeRequests.length === 1 ? 405 : 302 };
            },
        }),
        (error) => error.code === 'HERO_MEDIA_SOURCE_REDIRECT_REJECTED',
    );
    assert.deepEqual(probeRequests.map((request) => request.method), ['HEAD', 'GET']);
    assert.equal(probeRequests[1].headers.Range, 'bytes=0-0');
    const safe = await assertAuthorizedRemoteSourceNetworkSafe(input, {
        authorizedSourceHosts: ['media.example.test'],
        lookupFn: async () => [{ address: '203.0.113.7', family: 4 }],
        fetchFn: async () => ({ status: 200 }),
    });
    assert.equal(safe, input);
});

test('HeroMediaAsset declares idempotent source and queue indexes without exposing an original URL by default', () => {
    const asset = new HeroMediaAsset({
        movieId: 'movie-1',
        sourceIdentity: 'a'.repeat(64),
        source: {
            type: 'AUTHORIZED_REMOTE_URL',
            provider: 'licensed',
            reference: 'trailer',
            originalUrl: 'https://media.example.test/trailers/movie-1.mp4',
            originalUrlHash: 'b'.repeat(64),
        },
        rights: { status: 'AUTHORIZED' },
    });
    assert.equal(asset.validateSync(), undefined);
    const indexes = HeroMediaAsset.schema.indexes();
    assert.ok(indexes.some(([fields, options]) => (
        fields.movieId === 1
        && fields.sourceIdentity === 1
        && options.unique
        && options.name === 'hero_media_source_identity_unique'
    )));
    assert.ok(indexes.some(([fields, options]) => (
        fields.cloudinaryPublicId === 1
        && options.unique
        && options.name === 'hero_media_ready_cloudinary_public_id_unique'
        && options.partialFilterExpression?.status === 'ready'
    )));
    assert.equal(HeroMediaAsset.schema.path('source.originalUrl').options.select, false);
});

test('existing ready source is reused instead of creating a duplicate ingestion request', async (t) => {
    const originals = { movieExists: Movie.exists, assetFindOne: HeroMediaAsset.findOne };
    Movie.exists = async () => ({ _id: 'movie-1' });
    HeroMediaAsset.findOne = () => chain({
        _id: 'asset-1',
        movieId: 'movie-1',
        status: 'ready',
        source: { type: 'AUTHORIZED_REMOTE_URL', provider: 'licensed', reference: 'trailer' },
        rights: { status: 'AUTHORIZED' },
    });
    t.after(() => {
        Movie.exists = originals.movieExists;
        HeroMediaAsset.findOne = originals.assetFindOne;
    });
    const result = await requestHeroMediaSource({
        movieId: 'movie-1',
        sourceType: 'AUTHORIZED_REMOTE_URL',
        sourceProvider: 'licensed',
        sourceReference: 'trailer',
        sourceUrl: 'https://media.example.test/trailers/movie-1.mp4',
        rightsStatus: 'AUTHORIZED',
        rightsConfirmed: true,
        authorizedSourceHosts: ['media.example.test'],
    });
    assert.equal(result.reused, true);
    assert.equal(result.shouldEnqueue, false);
    assert.equal(result.asset.status, 'ready');
});

test('verification refuses a duplicate legacy Movie URL even before its registry migration row exists', async (t) => {
    const originals = { assetExists: HeroMediaAsset.exists, movieExists: Movie.exists };
    HeroMediaAsset.exists = async () => null;
    Movie.exists = async () => ({ _id: 'legacy-movie' });
    t.after(() => {
        HeroMediaAsset.exists = originals.assetExists;
        Movie.exists = originals.movieExists;
    });
    await assert.rejects(
        recordVerifiedHeroMediaAsset({
            movieId: 'movie-1',
            verified: {
                ...nativeMovie('movie-1'),
                publicId: 'hero_trailers/movie-1/official',
                movieId: 'movie-1',
                url: 'https://res.cloudinary.com/test/video/upload/hero_trailers/shared/official.mp4',
                mimeType: 'video/mp4',
                posterUrl: 'https://res.cloudinary.com/test/image/upload/shared.jpg',
                codec: 'h264/aac',
                bytes: 5_000_000,
                duration: 90,
                width: 1920,
                height: 1080,
                verifiedAt: new Date(),
            },
        }),
        (error) => error.code === 'HERO_MEDIA_DUPLICATE' && error.status === 409,
    );
});

test('verification rejects a duplicate Cloudinary public ID even for another registry row of the same movie', async (t) => {
    const originals = { assetExists: HeroMediaAsset.exists, movieExists: Movie.exists };
    HeroMediaAsset.exists = async (query) => (
        query.cloudinaryPublicId ? { _id: 'other-asset' } : null
    );
    Movie.exists = async () => null;
    t.after(() => {
        HeroMediaAsset.exists = originals.assetExists;
        Movie.exists = originals.movieExists;
    });
    await assert.rejects(
        recordVerifiedHeroMediaAsset({
            movieId: 'movie-1',
            verified: {
                ...nativeMovie('movie-1'),
                publicId: 'hero_trailers/movie-1/official',
                movieId: 'movie-1',
                url: 'https://res.cloudinary.com/test/video/upload/hero_trailers/movie-1/official.mp4',
                mimeType: 'video/mp4',
                posterUrl: 'https://res.cloudinary.com/test/image/upload/movie-1.jpg',
            },
        }),
        (error) => error?.code === 'HERO_MEDIA_DUPLICATE' && error?.status === 409,
    );
});

test('authorized remote ingestion asks Cloudinary to fetch the URL and makes only one claim', async (t) => {
    const originalFindById = HeroMediaAsset.findById;
    const originalFindOneAndUpdate = HeroMediaAsset.findOneAndUpdate;
    const originalUpload = heroMediaIngestionRuntime.upload;
    const originalProbe = heroMediaIngestionRuntime.probeRemoteSource;
    const asset = {
        _id: 'asset-1',
        movieId: 'movie-1',
        status: 'pending',
        sourceStatus: 'ready_for_ingestion',
        source: {
            type: 'AUTHORIZED_REMOTE_URL',
            provider: 'licensed',
            reference: 'trailer',
            originalUrl: 'https://media.example.test/trailers/movie-1.mp4',
            originalUrlHash: 'a'.repeat(64),
        },
        rights: { status: 'AUTHORIZED', provenance: null },
    };
    let claimCount = 0;
    let uploadCount = 0;
    let uploadedUrl = '';
    HeroMediaAsset.findById = () => chain({
        ...asset,
        status: claimCount > 0 ? 'processing' : 'pending',
        cloudinaryPublicId: claimCount > 0 ? 'hero_trailers/movie-1/remote-asset-1' : '',
    });
    HeroMediaAsset.findOneAndUpdate = (_filter, update) => {
        if (update.$inc) {
            if (claimCount > 0) return chain(null);
            claimCount += 1;
            return chain({ ...asset, status: 'ingesting' });
        }
        return chain({ ...asset, status: 'processing', cloudinaryPublicId: 'hero_trailers/movie-1/remote-asset-1' });
    };
    heroMediaIngestionRuntime.upload = async (url, options) => {
        uploadCount += 1;
        uploadedUrl = url;
        assert.equal(options.resource_type, 'video');
        assert.equal(options.folder, 'hero_trailers/movie-1');
        assert.equal(options.context.movie_id, 'movie-1');
        return { public_id: 'hero_trailers/movie-1/remote-asset-1' };
    };
    heroMediaIngestionRuntime.probeRemoteSource = async (url) => url;
    t.after(() => {
        HeroMediaAsset.findById = originalFindById;
        HeroMediaAsset.findOneAndUpdate = originalFindOneAndUpdate;
        heroMediaIngestionRuntime.upload = originalUpload;
        heroMediaIngestionRuntime.probeRemoteSource = originalProbe;
    });
    const result = await ingestAuthorizedHeroMedia({
        assetId: 'asset-1',
        authorizedSourceHosts: ['media.example.test'],
    });
    const duplicateAttempt = await ingestAuthorizedHeroMedia({
        assetId: 'asset-1',
        authorizedSourceHosts: ['media.example.test'],
    });
    assert.equal(result.shouldVerify, true);
    assert.equal(duplicateAttempt.reused, true);
    assert.equal(uploadedUrl, asset.source.originalUrl);
    assert.equal(claimCount, 1);
    assert.equal(uploadCount, 1);
});

test('pool readiness reports 5/5/5 and leaves a healthy active batch untouched while the next pool is incomplete', async (t) => {
    const groups = pool();
    const movieIds = Object.values(groups).flat();
    const movies = movieIds.map(nativeMovie);
    const readiness = getHeroPoolReadiness({ pool: { ...groups, movieIds }, movies });
    assert.equal(readiness.complete, true);
    assert.deepEqual(readiness.categoryCounts, { newest: 5, hot: 5, discovery: 5 });

    const originals = {
        batchFind: HeroRotationBatch.find,
        batchUpdateOne: HeroRotationBatch.updateOne,
        movieFind: Movie.find,
        startSession: heroRotationRuntime.startSession,
    };
    const preparing = {
        _id: 'preparing-1',
        status: 'preparing',
        batchKey: 'hero-next',
        version: 2,
        ...groups,
        movieIds,
        activeHeroMovieIds: movieIds.slice(0, 5),
    };
    const incompleteMovies = movies.map((movie) => (
        movie._id === 'discovery-4' ? { ...movie, heroVideoStatus: 'missing' } : movie
    ));
    const updates = [];
    HeroRotationBatch.find = () => chain([preparing]);
    HeroRotationBatch.updateOne = async (...args) => {
        updates.push(args);
        return { modifiedCount: 1 };
    };
    Movie.find = () => chain(incompleteMovies);
    heroRotationRuntime.startSession = async () => {
        assert.fail('An incomplete preparing batch must not enter an activation transaction.');
    };
    t.after(() => {
        HeroRotationBatch.find = originals.batchFind;
        HeroRotationBatch.updateOne = originals.batchUpdateOne;
        Movie.find = originals.movieFind;
        heroRotationRuntime.startSession = originals.startSession;
    });
    const result = await reconcilePreparingHeroBatches({ now: new Date('2026-08-08T00:00:00Z') });
    assert.equal(result.status, 'NEXT_POOL_PREPARING');
    assert.equal(result.activated, false);
    assert.equal(updates.length, 1);
    assert.equal(updates[0][1].$set.status, 'preparing');
});

test('a 15/15 preparing pool atomically retires the old batch only after preflight succeeds', async (t) => {
    const groups = pool();
    const movieIds = Object.values(groups).flat();
    const movies = movieIds.map(nativeMovie);
    const originals = {
        batchFind: HeroRotationBatch.find,
        batchFindOne: HeroRotationBatch.findOne,
        batchUpdateOne: HeroRotationBatch.updateOne,
        batchUpdateMany: HeroRotationBatch.updateMany,
        movieFind: Movie.find,
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        startSession: heroRotationRuntime.startSession,
        deleteByPattern: heroRotationRuntime.deleteByPattern,
        deleteKeys: heroRotationRuntime.deleteKeys,
    };
    const preparing = {
        _id: 'preparing-1',
        status: 'preparing',
        batchKey: 'hero-next',
        version: 2,
        nextRefreshAt: new Date('2026-08-10T00:00:00Z'),
        ...groups,
        movieIds,
        activeHeroMovieIds: ['new-0', 'hot-0', 'discovery-0', 'new-1', 'hot-1'],
        sourceMetadata: {},
    };
    const transactionalBatch = {
        ...preparing,
        status: 'ready_to_activate',
        toObject() { return { ...this }; },
        async save() {},
    };
    const retireCalls = [];
    HeroRotationBatch.find = () => chain([preparing]);
    HeroRotationBatch.updateOne = async () => ({ modifiedCount: 1 });
    HeroRotationBatch.findOne = () => ({ session: () => transactionalBatch });
    HeroRotationBatch.updateMany = async (...args) => {
        retireCalls.push(args);
        return { modifiedCount: 1 };
    };
    Movie.find = () => chain(movies);
    SiteConfig.findOneAndUpdate = async () => ({ acknowledged: true });
    heroRotationRuntime.startSession = async () => ({
        withTransaction: async (work) => work(),
        endSession: async () => undefined,
    });
    heroRotationRuntime.deleteByPattern = async () => 1;
    heroRotationRuntime.deleteKeys = async () => 1;
    t.after(() => {
        HeroRotationBatch.find = originals.batchFind;
        HeroRotationBatch.findOne = originals.batchFindOne;
        HeroRotationBatch.updateOne = originals.batchUpdateOne;
        HeroRotationBatch.updateMany = originals.batchUpdateMany;
        Movie.find = originals.movieFind;
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        heroRotationRuntime.startSession = originals.startSession;
        heroRotationRuntime.deleteByPattern = originals.deleteByPattern;
        heroRotationRuntime.deleteKeys = originals.deleteKeys;
    });
    const result = await reconcilePreparingHeroBatches({ now: new Date('2026-08-08T00:00:00Z') });
    assert.equal(result.status, 'ACTIVE');
    assert.equal(result.activated, true);
    assert.equal(transactionalBatch.status, 'active');
    assert.equal(retireCalls.length, 1);
    assert.deepEqual(retireCalls[0][0], { status: 'active', _id: { $ne: 'preparing-1' } });
});
