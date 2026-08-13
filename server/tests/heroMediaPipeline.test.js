import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
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
import { registeredHeroAssetsForMovies } from './heroMediaTestFixtures.js';

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

const createHttpsRequestStub = (responses, calls = []) => {
    const queue = [...responses];
    return (target, options, onResponse) => {
        const request = new EventEmitter();
        request.setTimeout = () => request;
        request.destroy = (error) => {
            if (error) queueMicrotask(() => request.emit('error', error));
            return request;
        };
        request.end = () => {
            const parsed = new URL(target);
            options.lookup(parsed.hostname, { all: false }, (error, address, family) => {
                if (error) {
                    request.emit('error', error);
                    return;
                }
                const response = queue.shift();
                if (!response) {
                    const unexpected = new Error('Unexpected HTTPS probe request.');
                    unexpected.code = 'UNEXPECTED_TEST_REQUEST';
                    request.emit('error', unexpected);
                    return;
                }
                calls.push({
                    url: parsed.toString(),
                    method: options.method,
                    address,
                    family,
                    servername: options.servername,
                    host: options.headers.Host,
                    range: options.headers.Range,
                    agent: options.agent,
                    rejectUnauthorized: options.rejectUnauthorized,
                });
                queueMicrotask(() => {
                    const incoming = new EventEmitter();
                    incoming.statusCode = response.status;
                    incoming.headers = response.headers || {};
                    incoming.resume = () => incoming;
                    incoming.destroy = () => incoming;
                    onResponse(incoming);
                });
            });
            return request;
        };
        return request;
    };
};

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

test('remote source network safety rejects every tested non-global IPv4 and IPv6 class', async () => {
    const input = 'https://media.example.test/trailers/movie-1.mp4';
    const unsafeAddresses = [
        '0.0.0.1',
        '10.0.0.1',
        '100.64.0.1',
        '127.0.0.1',
        '169.254.1.1',
        '172.16.0.1',
        '192.0.0.1',
        '192.0.2.1',
        '192.168.0.1',
        '198.18.0.1',
        '198.51.100.1',
        '203.0.113.1',
        '224.0.0.1',
        '240.0.0.1',
        '255.255.255.255',
        '::',
        '::1',
        '::ffff:127.0.0.1',
        '::ffff:7f00:1',
        '::ffff:93.184.216.34',
        '64:ff9b::192.0.2.1',
        '100::1',
        '2001::1',
        '2001:2::1',
        '2001:db8::1',
        '2002:c000:201::1',
        '3fff::1',
        '4000::1',
        '5f00::1',
        'fc00::1',
        'fe80::1',
        'fe90::1',
        'fec0::1',
        'ff02::1',
    ];
    let probeRequests = 0;
    for (const address of unsafeAddresses) {
        await assert.rejects(
            assertAuthorizedRemoteSourceNetworkSafe(input, {
                authorizedSourceHosts: ['media.example.test'],
                lookupFn: async () => [{ address, family: address.includes(':') ? 6 : 4 }],
                httpsRequestFn: () => {
                    probeRequests += 1;
                    assert.fail(`unsafe address ${address} must not be requested`);
                },
            }),
            (error) => error.code === 'HERO_MEDIA_SOURCE_NETWORK_UNSAFE',
            address,
        );
    }
    assert.equal(probeRequests, 0);

    await assert.rejects(
        assertAuthorizedRemoteSourceNetworkSafe(input, {
            authorizedSourceHosts: ['media.example.test'],
            lookupFn: async () => [
                { address: '93.184.216.34', family: 4 },
                { address: '127.0.0.1', family: 4 },
            ],
            httpsRequestFn: () => assert.fail('a mixed unsafe DNS answer must not be requested'),
        }),
        (error) => error.code === 'HERO_MEDIA_SOURCE_NETWORK_UNSAFE',
    );

    for (const address of ['93.184.216.34', '2606:4700:4700::1111']) {
        const calls = [];
        const safe = await assertAuthorizedRemoteSourceNetworkSafe(input, {
            authorizedSourceHosts: ['media.example.test'],
            lookupFn: async () => [{ address, family: address.includes(':') ? 6 : 4 }],
            httpsRequestFn: createHttpsRequestStub([{ status: 200 }], calls),
        });
        assert.equal(safe, input);
        assert.equal(calls[0].address, address);
    }
});

test('remote source probe pins each validated address while preserving HTTPS host and SNI across redirects', async () => {
    const input = 'https://media.example.test/trailers/movie-1.mp4';
    const finalUrl = 'https://cdn.example.test/final/movie-1.mp4';
    const dnsCalls = [];
    const requestCalls = [];
    const result = await assertAuthorizedRemoteSourceNetworkSafe(input, {
        authorizedSourceHosts: ['media.example.test', 'cdn.example.test'],
        lookupFn: async (hostname) => {
            dnsCalls.push(hostname);
            return [{
                address: hostname === 'media.example.test' ? '93.184.216.34' : '1.1.1.1',
                family: 4,
            }];
        },
        httpsRequestFn: createHttpsRequestStub([
            { status: 302, headers: { location: finalUrl } },
            { status: 200 },
        ], requestCalls),
    });

    assert.equal(result, finalUrl);
    assert.deepEqual(dnsCalls, ['media.example.test', 'cdn.example.test']);
    assert.deepEqual(requestCalls.map((call) => ({
        address: call.address,
        servername: call.servername,
        host: call.host,
        agent: call.agent,
        rejectUnauthorized: call.rejectUnauthorized,
    })), [
        {
            address: '93.184.216.34',
            servername: 'media.example.test',
            host: 'media.example.test',
            agent: false,
            rejectUnauthorized: true,
        },
        {
            address: '1.1.1.1',
            servername: 'cdn.example.test',
            host: 'cdn.example.test',
            agent: false,
            rejectUnauthorized: true,
        },
    ]);
});

test('remote source probe revalidates DNS for GET fallback and rejects unsafe or unauthorized redirect hops', async () => {
    const input = 'https://media.example.test/trailers/movie-1.mp4';
    const fallbackCalls = [];
    let fallbackDnsCalls = 0;
    const safe = await assertAuthorizedRemoteSourceNetworkSafe(input, {
        authorizedSourceHosts: ['media.example.test'],
        lookupFn: async () => {
            fallbackDnsCalls += 1;
            return [{ address: '93.184.216.34', family: 4 }];
        },
        httpsRequestFn: createHttpsRequestStub([
            { status: 405 },
            { status: 200 },
        ], fallbackCalls),
    });
    assert.equal(safe, input);
    assert.equal(fallbackDnsCalls, 2);
    assert.deepEqual(fallbackCalls.map((request) => request.method), ['HEAD', 'GET']);
    assert.equal(fallbackCalls[1].range, 'bytes=0-0');

    const reboundCalls = [];
    let reboundDnsCalls = 0;
    await assert.rejects(
        assertAuthorizedRemoteSourceNetworkSafe(input, {
            authorizedSourceHosts: ['media.example.test'],
            lookupFn: async () => {
                reboundDnsCalls += 1;
                return [{
                    address: reboundDnsCalls === 1 ? '93.184.216.34' : '127.0.0.1',
                    family: 4,
                }];
            },
            httpsRequestFn: createHttpsRequestStub([{ status: 405 }], reboundCalls),
        }),
        (error) => error.code === 'HERO_MEDIA_SOURCE_NETWORK_UNSAFE',
    );
    assert.equal(reboundDnsCalls, 2);
    assert.equal(reboundCalls.length, 1);

    const privateRedirectCalls = [];
    await assert.rejects(
        assertAuthorizedRemoteSourceNetworkSafe(input, {
            authorizedSourceHosts: ['media.example.test', 'cdn.example.test'],
            lookupFn: async (hostname) => [{
                address: hostname === 'media.example.test' ? '93.184.216.34' : '169.254.169.254',
                family: 4,
            }],
            httpsRequestFn: createHttpsRequestStub([{
                status: 302,
                headers: { location: 'https://cdn.example.test/private-target.mp4' },
            }], privateRedirectCalls),
        }),
        (error) => error.code === 'HERO_MEDIA_SOURCE_NETWORK_UNSAFE',
    );
    assert.equal(privateRedirectCalls.length, 1);

    const unauthorizedRedirectCalls = [];
    await assert.rejects(
        assertAuthorizedRemoteSourceNetworkSafe(input, {
            authorizedSourceHosts: ['media.example.test'],
            lookupFn: async () => [{ address: '93.184.216.34', family: 4 }],
            httpsRequestFn: createHttpsRequestStub([{
                status: 302,
                headers: { location: 'https://unapproved.example.test/movie-1.mp4' },
            }], unauthorizedRedirectCalls),
        }),
        (error) => error.code === 'HERO_MEDIA_SOURCE_REDIRECT_REJECTED',
    );
    assert.equal(unauthorizedRedirectCalls.length, 1);

    await assert.rejects(
        assertAuthorizedRemoteSourceNetworkSafe(input, {
            authorizedSourceHosts: ['media.example.test'],
            lookupFn: async () => [{ address: '93.184.216.34', family: 4 }],
            httpsRequestFn: createHttpsRequestStub([{ status: 302, headers: {} }]),
        }),
        (error) => error.code === 'HERO_MEDIA_SOURCE_REDIRECT_REJECTED',
    );
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
        batchFindOne: HeroRotationBatch.findOne,
        batchUpdateOne: HeroRotationBatch.updateOne,
        movieFind: Movie.find,
        configFindOne: SiteConfig.findOne,
        loadReadyMediaAssets: heroRotationRuntime.loadReadyMediaAssets,
        startSession: heroRotationRuntime.startSession,
    };
    const preparing = {
        _id: 'preparing-1',
        status: 'preparing',
        batchKey: 'hero-next',
        version: 2,
        fencingToken: 2,
        previousBatchId: 'active-1',
        ...groups,
        movieIds,
        activeHeroMovieIds: movieIds.slice(0, 5),
    };
    const incompleteMovies = movies.map((movie) => (
        movie._id === 'discovery-4' ? { ...movie, heroVideoStatus: 'missing' } : movie
    ));
    const updates = [];
    HeroRotationBatch.find = () => chain([preparing]);
    HeroRotationBatch.findOne = () => chain({ _id: 'active-1', status: 'active', version: 1 });
    HeroRotationBatch.updateOne = async (...args) => {
        updates.push(args);
        return { modifiedCount: 1 };
    };
    Movie.find = () => chain(incompleteMovies);
    SiteConfig.findOne = () => chain({
        heroRotation: { activeBatchId: 'active-1', lastFencingToken: 1 },
    });
    heroRotationRuntime.loadReadyMediaAssets = async (ids) => (
        registeredHeroAssetsForMovies(movies, ids)
    );
    heroRotationRuntime.startSession = async () => {
        assert.fail('An incomplete preparing batch must not enter an activation transaction.');
    };
    t.after(() => {
        HeroRotationBatch.find = originals.batchFind;
        HeroRotationBatch.findOne = originals.batchFindOne;
        HeroRotationBatch.updateOne = originals.batchUpdateOne;
        Movie.find = originals.movieFind;
        SiteConfig.findOne = originals.configFindOne;
        heroRotationRuntime.loadReadyMediaAssets = originals.loadReadyMediaAssets;
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
        configFindOne: SiteConfig.findOne,
        configUpdateOne: SiteConfig.updateOne,
        configFindOneAndUpdate: SiteConfig.findOneAndUpdate,
        loadReadyMediaAssets: heroRotationRuntime.loadReadyMediaAssets,
        startSession: heroRotationRuntime.startSession,
        deleteByPattern: heroRotationRuntime.deleteByPattern,
        deleteKeys: heroRotationRuntime.deleteKeys,
    };
    const preparing = {
        _id: 'preparing-1',
        status: 'preparing',
        batchKey: 'hero-next',
        version: 2,
        fencingToken: 2,
        previousBatchId: 'active-1',
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
    const activeBatch = { _id: 'active-1', status: 'active', version: 1 };
    const updateOneCalls = [];
    const updateManyCalls = [];
    HeroRotationBatch.find = () => chain([preparing]);
    HeroRotationBatch.updateOne = async (...args) => {
        updateOneCalls.push(args);
        return { modifiedCount: 1 };
    };
    HeroRotationBatch.findOne = (filter) => (
        filter?._id === preparing._id
            ? { session: () => transactionalBatch }
            : chain(activeBatch)
    );
    HeroRotationBatch.updateMany = async (...args) => {
        updateManyCalls.push(args);
        return { modifiedCount: 1 };
    };
    Movie.find = () => chain(movies);
    SiteConfig.findOne = () => chain({
        heroRotation: { activeBatchId: 'active-1', lastFencingToken: 1 },
    });
    SiteConfig.updateOne = async () => ({ acknowledged: true });
    SiteConfig.findOneAndUpdate = async () => ({
        heroRotation: { activeBatchId: preparing._id, lastFencingToken: 2 },
    });
    heroRotationRuntime.loadReadyMediaAssets = async (ids) => (
        registeredHeroAssetsForMovies(movies, ids)
    );
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
        SiteConfig.findOne = originals.configFindOne;
        SiteConfig.updateOne = originals.configUpdateOne;
        SiteConfig.findOneAndUpdate = originals.configFindOneAndUpdate;
        heroRotationRuntime.loadReadyMediaAssets = originals.loadReadyMediaAssets;
        heroRotationRuntime.startSession = originals.startSession;
        heroRotationRuntime.deleteByPattern = originals.deleteByPattern;
        heroRotationRuntime.deleteKeys = originals.deleteKeys;
    });
    const result = await reconcilePreparingHeroBatches({ now: new Date('2026-08-08T00:00:00Z') });
    assert.equal(result.status, 'ACTIVE');
    assert.equal(result.activated, true);
    assert.equal(transactionalBatch.status, 'active');
    assert.ok(updateOneCalls.some(([filter]) => filter._id === 'active-1' && filter.status === 'active'));
    assert.equal(updateManyCalls.length, 1);
    assert.deepEqual(updateManyCalls[0][0].status.$in, ['building', 'preparing', 'ready_to_activate']);
});
