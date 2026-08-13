import 'dotenv/config';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import HeroMediaAsset from '../models/HeroMediaAsset.js';
import Movie from '../models/Movie.js';
import { verifyHeroMediaAssetIndexes } from '../configs/indexes.js';
import { createHeroMediaSourceIdentity } from '../services/heroMediaAssetService.js';
import { validateNativeHeroMovie } from '../services/heroRotationService.js';

const LOG_PREFIX = '[hero-media-pipeline-migration]';
const REQUIRED_INDEXES = Object.freeze([
    'hero_media_source_identity_unique',
    'hero_media_ready_cloudinary_public_id_unique',
    'hero_media_movie_status',
    'hero_media_queue_status',
]);
const SECRET_ENV_NAME = /(secret|token|password|api_?key|mongodb_uri|redis_url|cloudinary_url)/i;

const connect = async ({ env = process.env, mongooseClient = mongoose } = {}) => {
    const uri = String(env.MONGODB_URI || '').trim();
    if (!uri) throw new Error('MONGODB_URI environment variable is not set');
    await mongooseClient.connect(uri, {
        serverSelectionTimeoutMS: Number(env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || 5000,
        socketTimeoutMS: Number(env.MONGODB_SOCKET_TIMEOUT_MS) || 15000,
        maxPoolSize: 5,
        family: 4,
        autoCreate: false,
        autoIndex: false,
    });
};

const assertNoIndexConflicts = async (assetModel) => {
    const duplicateSourceIdentity = await assetModel.aggregate([
        { $group: { _id: { movieId: '$movieId', sourceIdentity: '$sourceIdentity' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: 1 },
    ]);
    if (duplicateSourceIdentity.length) {
        throw new Error('Cannot migrate: duplicate Hero media movie/source identity exists');
    }
    const duplicateReadyPublicId = await assetModel.aggregate([
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

const assertNoMigrationTargetConflicts = async (candidates, assetModel) => {
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
    const existingReadyAssets = await assetModel.find({
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

const serializeAttribution = (value) => {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    try {
        return JSON.stringify(value);
    } catch {
        return '';
    }
};

const createOperations = (candidates) => candidates.map(({ movie, source, sourceIdentity }) => {
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
                    posterUrl: movie.heroVideoPosterUrl,
                    mimeType: movie.heroVideoMimeType,
                    format: String(movie.heroVideoMimeType || '').split('/')[1] || '',
                    duration: movie.heroVideoDuration,
                    width: movie.heroVideoWidth,
                    height: movie.heroVideoHeight,
                    bytes: movie.heroVideoBytes,
                    videoCodec,
                    audioCodec,
                    checksum: movie.heroVideoChecksum || '',
                    attribution: serializeAttribution(movie.heroVideoAttribution),
                    verificationStatus: 'verified',
                    verificationReasons: [],
                    verifiedAt: movie.heroVideoVerifiedAt,
                    failure: {},
                },
            },
            upsert: true,
        },
    };
});

export const runHeroMediaPipelineMigration = async ({
    connection = mongoose.connection,
    movieModel = Movie,
    assetModel = HeroMediaAsset,
    verifyIndexes = verifyHeroMediaAssetIndexes,
    logger = console,
} = {}) => {
    const collectionExists = await connection.db
        .listCollections({ name: assetModel.collection.name }, { nameOnly: true })
        .hasNext();
    if (!collectionExists) await assetModel.createCollection();

    const movies = await movieModel.find({ heroVideoStatus: 'ready' }).lean();
    const candidates = movies.map(createMigrationCandidate).filter(Boolean);
    await assertNoMigrationTargetConflicts(candidates, assetModel);
    await assertNoIndexConflicts(assetModel);
    await assetModel.createIndexes();
    await verifyIndexes();

    const operations = createOperations(candidates);
    const result = operations.length
        ? await assetModel.bulkWrite(operations, { ordered: false, timestamps: false })
        : { upsertedCount: 0, modifiedCount: 0 };
    const summary = {
        indexes: [...REQUIRED_INDEXES],
        inspectedMovies: movies.length,
        registeredAssets: operations.length,
        upserted: result.upsertedCount || 0,
        modified: result.modifiedCount || 0,
    };
    logger.info(LOG_PREFIX, JSON.stringify(summary));
    return summary;
};

export const sanitizeMigrationError = (error, env = process.env) => {
    let message = String(error?.message || 'Hero media pipeline migration failed.');
    const secrets = Object.entries(env)
        .filter(([name, value]) => SECRET_ENV_NAME.test(name) && String(value || '').length >= 4)
        .map(([, value]) => String(value))
        .sort((left, right) => right.length - left.length);
    for (const secret of secrets) message = message.split(secret).join('[redacted]');
    message = message
        .replace(/mongodb(?:\+srv)?:\/\/[^@\s/]+@/giu, 'mongodb://[redacted]@')
        .replace(/([?&](?:api_?key|token|signature|secret|password)=)[^&\s]+/giu, '$1[redacted]');
    return message.slice(0, 500);
};

export const runHeroMediaPipelineMigrationCli = async ({
    env = process.env,
    logger = console,
    connectDatabase = () => connect({ env }),
    disconnectDatabase = () => mongoose.disconnect(),
    migrate = () => runHeroMediaPipelineMigration({ logger }),
} = {}) => {
    let exitCode = 0;
    try {
        await connectDatabase();
        await migrate();
    } catch (error) {
        exitCode = 1;
        logger.error(LOG_PREFIX, sanitizeMigrationError(error, env));
    } finally {
        try {
            await disconnectDatabase();
        } catch {
            // The primary migration result is more useful than a disconnect failure.
        }
    }
    return exitCode;
};

const isDirectInvocation = process.argv[1]
    && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectInvocation) {
    process.exitCode = await runHeroMediaPipelineMigrationCli();
}
