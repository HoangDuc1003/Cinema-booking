import assert from 'node:assert/strict';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import HeroMediaAsset from '../models/HeroMediaAsset.js';
import HeroRotationBatch from '../models/HeroRotationBatch.js';
import { verifyHeroMediaAssetIndexes } from '../configs/indexes.js';
import {
    runHeroMediaPipelineMigration,
    runHeroMediaPipelineMigrationCli,
} from '../scripts/migrate-hero-media-pipeline.js';

const clone = (value) => structuredClone(value);
const withoutTimestamps = (assets) => assets.map(({ createdAt, updatedAt, ...asset }) => asset);

const validMovie = (id, secret) => ({
    _id: id,
    heroVideoId: `nitrocine/hero/${id}`,
    heroVideoMovieId: id,
    heroVideoUrl: `https://res.cloudinary.com/nitrocine/video/upload/${id}.mp4?token=${secret}`,
    heroVideoMimeType: 'video/mp4',
    heroVideoPosterUrl: `https://res.cloudinary.com/nitrocine/image/upload/${id}.jpg`,
    heroVideoStatus: 'ready',
    heroVideoVersion: 'migration-v1',
    heroVideoDuration: 48,
    heroVideoWidth: 1920,
    heroVideoHeight: 1080,
    heroVideoBytes: 4_800_000,
    heroVideoCodec: 'h264/aac',
    heroVideoVerifiedAt: new Date('2026-08-10T12:00:00.000Z'),
    heroVideoChecksum: `sha256-${id}`,
    heroVideoAttribution: { license: 'studio-owned', reference: id },
});

const duplicateError = (indexName) => {
    const error = new Error(`E11000 duplicate key error index: ${indexName}`);
    error.code = 11000;
    return error;
};

const assertUniqueAssets = (assets) => {
    const sourceIdentities = new Set();
    const readyPublicIds = new Set();
    for (const asset of assets) {
        const sourceKey = `${asset.movieId}\u0000${asset.sourceIdentity}`;
        if (sourceIdentities.has(sourceKey)) {
            throw duplicateError('hero_media_source_identity_unique');
        }
        sourceIdentities.add(sourceKey);
        if (asset.status === 'ready' && String(asset.cloudinaryPublicId || '') > '') {
            if (readyPublicIds.has(asset.cloudinaryPublicId)) {
                throw duplicateError('hero_media_ready_cloudinary_public_id_unique');
            }
            readyPublicIds.add(asset.cloudinaryPublicId);
        }
    }
};

const indexDocument = ([key, options]) => ({
    name: options.name || Object.entries(key).map(([field, order]) => `${field}_${order}`).join('_'),
    key: clone(key),
    ...clone(options),
});

const createDisposableMigrationState = ({ movies, assets, rotationBatches }) => {
    const state = {
        movies: clone(movies),
        assets: clone(assets),
        rotationBatches: clone(rotationBatches),
        collectionExists: false,
        collectionCreateCalls: 0,
        createIndexesCalls: 0,
        verifyIndexesCalls: 0,
        bulkWriteCalls: 0,
        indexes: new Map(),
    };

    const connection = {
        db: {
            listCollections: ({ name }) => ({
                hasNext: async () => name === 'heromediaassets' && state.collectionExists,
            }),
            dropCollection: async (name) => {
                if (name === 'herorotationbatches') state.rotationBatches = [];
                if (name === 'heromediaassets') state.assets = [];
            },
        },
    };

    const movieModel = {
        find: (filter) => ({
            lean: async () => clone(state.movies.filter(
                (movie) => !filter.heroVideoStatus || movie.heroVideoStatus === filter.heroVideoStatus,
            )),
        }),
    };

    const assetModel = {
        collection: { name: 'heromediaassets' },
        createCollection: async () => {
            if (state.collectionExists) throw new Error('NamespaceExists');
            state.collectionExists = true;
            state.collectionCreateCalls += 1;
        },
        aggregate: async (pipeline) => {
            const group = pipeline.find((stage) => stage.$group)?.$group;
            if (group?._id?.movieId === '$movieId') {
                const counts = new Map();
                for (const asset of state.assets) {
                    const key = `${asset.movieId}\u0000${asset.sourceIdentity}`;
                    counts.set(key, (counts.get(key) || 0) + 1);
                }
                return [...counts.entries()]
                    .filter(([, count]) => count > 1)
                    .slice(0, 1)
                    .map(([key, count]) => ({ _id: key, count }));
            }
            const counts = new Map();
            for (const asset of state.assets) {
                if (asset.status !== 'ready' || !asset.cloudinaryPublicId) continue;
                counts.set(asset.cloudinaryPublicId, (counts.get(asset.cloudinaryPublicId) || 0) + 1);
            }
            return [...counts.entries()]
                .filter(([, count]) => count > 1)
                .slice(0, 1)
                .map(([_id, count]) => ({ _id, count }));
        },
        find: (filter) => {
            const matches = state.assets.filter((asset) => (
                asset.status === filter.status
                && filter.cloudinaryPublicId.$in.includes(asset.cloudinaryPublicId)
            ));
            return {
                select() {
                    return this;
                },
                lean: async () => clone(matches),
            };
        },
        createIndexes: async () => {
            state.createIndexesCalls += 1;
            assertUniqueAssets(state.assets);
            for (const schemaIndex of HeroMediaAsset.schema.indexes()) {
                const next = indexDocument(schemaIndex);
                const existing = state.indexes.get(next.name);
                if (existing && !isDeepStrictEqual(existing, next)) {
                    const error = new Error(`IndexOptionsConflict: ${next.name}`);
                    error.code = 85;
                    throw error;
                }
                state.indexes.set(next.name, next);
            }
        },
        bulkWrite: async (operations, options) => {
            state.bulkWriteCalls += 1;
            assert.equal(options.ordered, false);
            assert.equal(options.timestamps, false);
            const writeTimestamp = new Date(`2026-08-11T00:00:0${state.bulkWriteCalls}.000Z`);
            let upsertedCount = 0;
            let modifiedCount = 0;
            for (const operation of operations) {
                const { filter, update, upsert } = operation.updateOne;
                assert.equal(upsert, true);
                const index = state.assets.findIndex((asset) => (
                    asset.movieId === filter.movieId && asset.sourceIdentity === filter.sourceIdentity
                ));
                const previous = index >= 0 ? state.assets[index] : null;
                const next = {
                    ...(previous || update.$setOnInsert),
                    ...clone(update.$set),
                    ...(options.timestamps === false ? {} : {
                        ...(!previous && { createdAt: writeTimestamp }),
                        updatedAt: writeTimestamp,
                    }),
                };
                const proposed = clone(state.assets);
                if (index >= 0) proposed[index] = next;
                else proposed.push(next);
                assertUniqueAssets(proposed);
                state.assets = proposed;
                if (index < 0) upsertedCount += 1;
                else if (!isDeepStrictEqual(previous, next)) modifiedCount += 1;
            }
            return { upsertedCount, modifiedCount };
        },
    };

    const verifyIndexes = async () => {
        state.verifyIndexesCalls += 1;
        const originalIndexes = HeroMediaAsset.collection.indexes;
        HeroMediaAsset.collection.indexes = async () => clone([...state.indexes.values()]);
        try {
            await verifyHeroMediaAssetIndexes();
        } finally {
            HeroMediaAsset.collection.indexes = originalIndexes;
        }
    };

    return { state, connection, movieModel, assetModel, verifyIndexes };
};

test('Hero media migration is idempotent across two runs and preserves active rotation state', async () => {
    const signedUrlSecret = 'fake-signed-url-secret';
    const newestMovieIds = Array.from({ length: 5 }, (_, index) => `movie-${index + 1}`);
    const hotMovieIds = Array.from({ length: 5 }, (_, index) => `movie-${index + 6}`);
    const discoveryMovieIds = Array.from({ length: 5 }, (_, index) => `movie-${index + 11}`);
    const activeBatch = {
        _id: '66b8e68e43fca1afde000001',
        batchKey: 'hero-2026-08-10',
        version: 1,
        runId: 'hero-migration-test-run',
        fencingToken: 1,
        status: 'active',
        generatedAt: new Date('2026-08-10T00:00:00.000Z'),
        activatedAt: new Date('2026-08-10T00:05:00.000Z'),
        nextRefreshAt: new Date('2026-08-12T00:05:00.000Z'),
        timezone: 'Asia/Ho_Chi_Minh',
        selectionSeed: 'migration-test-seed',
        newestMovieIds,
        hotMovieIds,
        discoveryMovieIds,
        movieIds: [...newestMovieIds, ...hotMovieIds, ...discoveryMovieIds],
        activeHeroMovieIds: [
            newestMovieIds[0],
            hotMovieIds[0],
            discoveryMovieIds[0],
            newestMovieIds[1],
            hotMovieIds[1],
        ],
    };
    assert.equal(new HeroRotationBatch(activeBatch).validateSync(), undefined);
    const unrelatedAsset = {
        movieId: 'unrelated',
        sourceIdentity: 'unrelated-source',
        status: 'failed',
        cloudinaryPublicId: '',
        failure: { code: 'PREEXISTING' },
    };
    const harness = createDisposableMigrationState({
        movies: [validMovie('movie-1', signedUrlSecret), validMovie('movie-2', signedUrlSecret)],
        assets: [unrelatedAsset],
        rotationBatches: [activeBatch],
    });
    const rotationSnapshot = clone(harness.state.rotationBatches);
    const unrelatedSnapshot = clone(unrelatedAsset);
    const logs = [];
    const logger = { info: (...parts) => logs.push(parts.join(' ')) };
    const dependencies = {
        connection: harness.connection,
        movieModel: harness.movieModel,
        assetModel: harness.assetModel,
        verifyIndexes: harness.verifyIndexes,
        logger,
    };

    const first = await runHeroMediaPipelineMigration(dependencies);
    const assetsAfterFirstRun = clone(harness.state.assets);
    const second = await runHeroMediaPipelineMigration(dependencies);

    assert.deepEqual(first, {
        indexes: [
            'hero_media_source_identity_unique',
            'hero_media_ready_cloudinary_public_id_unique',
            'hero_media_movie_status',
            'hero_media_queue_status',
        ],
        inspectedMovies: 2,
        registeredAssets: 2,
        upserted: 2,
        modified: 0,
    });
    assert.equal(second.upserted, 0);
    assert.equal(second.modified, 0);
    assert.deepEqual(
        withoutTimestamps(harness.state.assets),
        withoutTimestamps(assetsAfterFirstRun),
    );
    assert.deepEqual(harness.state.assets[0], unrelatedSnapshot);
    assert.deepEqual(harness.state.rotationBatches, rotationSnapshot);
    assert.equal(harness.state.assets.length, 3);
    assert.equal(harness.state.collectionCreateCalls, 1);
    assert.equal(harness.state.createIndexesCalls, 2);
    assert.equal(harness.state.verifyIndexesCalls, 2);
    assert.equal(harness.state.bulkWriteCalls, 2);
    assertUniqueAssets(harness.state.assets);

    const migrated = harness.state.assets.find((asset) => asset.movieId === 'movie-1');
    assert.equal(migrated.posterUrl, 'https://res.cloudinary.com/nitrocine/image/upload/movie-1.jpg');
    assert.equal(migrated.checksum, 'sha256-movie-1');
    assert.equal(
        migrated.attribution,
        JSON.stringify({ license: 'studio-owned', reference: 'movie-1' }),
    );
    assert.equal(logs.length, 2);
    assert.ok(logs.every((entry) => !entry.includes(signedUrlSecret)));
});

test('Hero media migration CLI redacts configured and URL-shaped secrets from failures', async () => {
    const mongoUri = 'mongodb://migration-user:fake-password@db.invalid/nitrocine';
    const apiKey = 'fake-api-key-value';
    const errors = [];
    let disconnected = false;
    const exitCode = await runHeroMediaPipelineMigrationCli({
        env: { MONGODB_URI: mongoUri, TMDB_API_KEY: apiKey },
        logger: { error: (...parts) => errors.push(parts.join(' ')) },
        connectDatabase: async () => undefined,
        migrate: async () => {
            throw new Error(`Connection failed for ${mongoUri}?api_key=${apiKey}`);
        },
        disconnectDatabase: async () => {
            disconnected = true;
        },
    });

    assert.equal(exitCode, 1);
    assert.equal(disconnected, true);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('[redacted]'));
    assert.ok(!errors[0].includes('fake-password'));
    assert.ok(!errors[0].includes(apiKey));
    assert.ok(!errors[0].includes(mongoUri));
});
