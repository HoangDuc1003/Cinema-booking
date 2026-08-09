import 'dotenv/config';
import mongoose from 'mongoose';
import HeroMediaAsset from '../models/HeroMediaAsset.js';
import Movie from '../models/Movie.js';
import { verifyHeroMediaAssetIndexes } from '../configs/indexes.js';
import { createHeroMediaSourceIdentity } from '../services/heroMediaAssetService.js';
import { validateNativeHeroMovie } from '../services/heroRotationService.js';

const connect = async () => {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI environment variable is not set');
    await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || 5000,
        socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS) || 15000,
        maxPoolSize: 5,
        family: 4,
        autoCreate: false,
        autoIndex: false,
    });
};

const assertNoIndexConflicts = async () => {
    const duplicateSourceIdentity = await HeroMediaAsset.aggregate([
        { $group: { _id: { movieId: '$movieId', sourceIdentity: '$sourceIdentity' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: 1 },
    ]);
    if (duplicateSourceIdentity.length) {
        throw new Error('Cannot migrate: duplicate Hero media movie/source identity exists');
    }
    const duplicateReadyPublicId = await HeroMediaAsset.aggregate([
        { $match: { status: 'ready', cloudinaryPublicId: { $type: 'string', $ne: '' } } },
        { $group: { _id: '$cloudinaryPublicId', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: 1 },
    ]);
    if (duplicateReadyPublicId.length) {
        throw new Error('Cannot migrate: duplicate ready Cloudinary Hero public ID exists');
    }
};

const createMigrationCandidate = (movie) => {
    const validation = validateNativeHeroMovie(movie);
    if (!validation.valid) return null;
    const source = {
        sourceType: 'CLOUDINARY_EXISTING',
        sourceProvider: 'cloudinary',
        sourceReference: movie.heroVideoId,
        originalUrlHash: '',
        rightsStatus: 'UNKNOWN',
    };
    return {
        movie,
        source,
        sourceIdentity: createHeroMediaSourceIdentity({ movieId: movie._id, ...source }),
    };
};

const assertNoMigrationTargetConflicts = async (candidates) => {
    const targetByPublicId = new Map();
    for (const candidate of candidates) {
        const publicId = String(candidate.movie.heroVideoId || '').trim();
        const existing = targetByPublicId.get(publicId);
        if (existing && existing.movieId !== String(candidate.movie._id)) {
            throw new Error('Cannot migrate: one Cloudinary Hero public ID is assigned to multiple movies');
        }
        targetByPublicId.set(publicId, {
            movieId: String(candidate.movie._id),
            sourceIdentity: candidate.sourceIdentity,
        });
    }
    if (!targetByPublicId.size) return;
    const existingReadyAssets = await HeroMediaAsset.find({
        status: 'ready',
        cloudinaryPublicId: { $in: [...targetByPublicId.keys()] },
    }).select('movieId sourceIdentity cloudinaryPublicId').lean();
    for (const asset of existingReadyAssets) {
        const target = targetByPublicId.get(String(asset.cloudinaryPublicId || '').trim());
        if (
            target
            && (String(asset.movieId) !== target.movieId || asset.sourceIdentity !== target.sourceIdentity)
        ) {
            throw new Error('Cannot migrate: a target Cloudinary Hero public ID is already registered to another asset');
        }
    }
};

async function main() {
    await connect();
    const collectionExists = await mongoose.connection.db
        .listCollections({ name: HeroMediaAsset.collection.name }, { nameOnly: true })
        .hasNext();
    if (!collectionExists) await HeroMediaAsset.createCollection();
    const movies = await Movie.find({ heroVideoStatus: 'ready' }).lean();
    const candidates = movies.map(createMigrationCandidate).filter(Boolean);
    await assertNoMigrationTargetConflicts(candidates);
    await assertNoIndexConflicts();
    await HeroMediaAsset.createIndexes();
    await verifyHeroMediaAssetIndexes();

    const operations = candidates.map(({ movie, source, sourceIdentity }) => {
        const [videoCodec = '', audioCodec = ''] = String(movie.heroVideoCodec || '').split('/');
        return {
            updateOne: {
                filter: { movieId: String(movie._id), sourceIdentity },
                update: {
                    $setOnInsert: { movieId: String(movie._id), sourceIdentity },
                    $set: {
                        source: {
                            type: source.sourceType,
                            provider: source.sourceProvider,
                            reference: source.sourceReference,
                            originalUrlHash: '',
                        },
                        rights: {
                            status: 'UNKNOWN',
                            approvedAt: null,
                            approvedBy: '',
                            provenance: { migratedFrom: 'Movie.heroVideo*', requiresRightsAudit: true },
                        },
                        sourceStatus: 'needs_authorized_source',
                        status: 'ready',
                        cloudinaryPublicId: movie.heroVideoId,
                        secureUrl: movie.heroVideoUrl,
                        mimeType: movie.heroVideoMimeType,
                        format: String(movie.heroVideoMimeType || '').split('/')[1] || '',
                        duration: movie.heroVideoDuration,
                        width: movie.heroVideoWidth,
                        height: movie.heroVideoHeight,
                        bytes: movie.heroVideoBytes,
                        videoCodec,
                        audioCodec,
                        verificationStatus: 'verified',
                        verificationReasons: [],
                        verifiedAt: movie.heroVideoVerifiedAt || new Date(),
                        failure: {},
                    },
                },
                upsert: true,
            },
        };
    });
    const result = operations.length
        ? await HeroMediaAsset.bulkWrite(operations, { ordered: false })
        : { upsertedCount: 0, modifiedCount: 0 };
    console.info('[hero-media-pipeline-migration]', JSON.stringify({
        indexes: [
            'hero_media_source_identity_unique',
            'hero_media_ready_cloudinary_public_id_unique',
            'hero_media_movie_status',
            'hero_media_queue_status',
        ],
        inspectedMovies: movies.length,
        registeredAssets: operations.length,
        upserted: result.upsertedCount || 0,
        modified: result.modifiedCount || 0,
    }));
}

main()
    .then(async () => {
        await mongoose.disconnect();
        process.exit(0);
    })
    .catch(async (error) => {
        console.error('[hero-media-pipeline-migration]', error.message);
        await mongoose.disconnect().catch(() => undefined);
        process.exit(1);
    });
