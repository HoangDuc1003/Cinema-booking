import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import HeroMediaAsset from '../models/HeroMediaAsset.js';
import Movie from '../models/Movie.js';

const sourceIdentityFor = ({ movieId, sourceType, sourceReference, originalUrlHash }) => createHash('sha256')
    .update([
        String(movieId || ''),
        String(sourceType || ''),
        String(sourceReference || ''),
        String(originalUrlHash || ''),
    ].join('|'))
    .digest('hex');

const asFailure = (error) => ({
    code: String(error?.code || 'HERO_MEDIA_FAILED').slice(0, 120),
    message: String(error?.message || 'Hero media operation failed.').slice(0, 500),
    transient: Boolean(error?.transient || error?.status >= 500 || error?.http_code >= 500),
    occurredAt: new Date(),
});

const movieFieldsFromVerifiedAsset = (verified) => ({
    heroVideoId: verified.publicId,
    heroVideoPublicId: verified.publicId,
    heroVideoStorageProvider: 'cloudinary',
    heroVideoStorageId: verified.publicId,
    heroVideoMovieId: verified.movieId,
    heroVideoUrl: verified.url,
    heroVideoMimeType: verified.mimeType,
    heroVideoPosterUrl: verified.posterUrl,
    heroVideoStatus: 'ready',
    heroVideoVersion: String(
        verified.version
        || (verified.verifiedAt ? new Date(verified.verifiedAt).getTime() : '')
        || verified.checksum
        || verified.publicId,
    ),
    heroVideoDuration: verified.duration,
    heroVideoWidth: verified.width,
    heroVideoHeight: verified.height,
    heroVideoBytes: verified.bytes,
    heroVideoCodec: verified.codec,
    heroVideoVerifiedAt: verified.verifiedAt,
    heroVideoSource: verified.source,
    heroVideoAttribution: verified.attribution,
    heroVideoChecksum: verified.checksum,
});

const verifiedAssetFields = (asset) => ({
    publicId: asset.cloudinaryPublicId,
    movieId: String(asset.movieId),
    url: asset.secureUrl,
    mimeType: asset.mimeType,
    posterUrl: asset.posterUrl,
    duration: asset.duration,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    codec: [asset.videoCodec, asset.audioCodec].filter(Boolean).join('/'),
    source: 'cloudinary',
    attribution: asset.attribution || '',
    checksum: asset.checksum || '',
    verifiedAt: asset.verifiedAt,
});

export const syncMovieFromReadyHeroMediaAsset = async (asset) => {
    if (
        asset?.status !== 'ready'
        || asset?.verificationStatus !== 'verified'
        || !asset?.cloudinaryPublicId
        || !asset?.secureUrl
    ) {
        const error = new Error('Hero media asset is not ready to synchronize.');
        error.code = 'HERO_MEDIA_NOT_READY';
        error.status = 409;
        throw error;
    }
    const movie = await Movie.findOneAndUpdate(
        { _id: String(asset.movieId) },
        { $set: movieFieldsFromVerifiedAsset(verifiedAssetFields(asset)) },
        { returnDocument: 'after' },
    );
    if (!movie) {
        const error = new Error('Movie not found.');
        error.code = 'HERO_MOVIE_NOT_FOUND';
        error.status = 404;
        throw error;
    }
    return movie;
};

export const createHeroMediaSourceIdentity = sourceIdentityFor;

export const recordHeroMediaFailure = async (assetId, error) => HeroMediaAsset.findByIdAndUpdate(
    assetId,
    {
        $set: {
            status: 'failed',
            verificationStatus: 'failed',
            verificationReasons: [String(error?.code || 'HERO_MEDIA_FAILED')],
            failure: asFailure(error),
        },
    },
    { returnDocument: 'after' },
).lean();

export const recordHeroMediaVerificationRetry = async (assetId, error) => HeroMediaAsset.findByIdAndUpdate(
    assetId,
    {
        $set: {
            status: 'processing',
            verificationStatus: 'processing',
            verificationReasons: [String(error?.code || 'HERO_MEDIA_VERIFY_RETRY')],
            failure: asFailure({ ...error, transient: true }),
        },
    },
    { returnDocument: 'after' },
).lean();

export const recordVerifiedHeroMediaAsset = async ({
    movieId,
    verified,
    source,
    assetId,
    updateMovie = true,
}) => {
    const id = String(movieId || verified?.movieId || '').trim();
    if (!id || !verified?.publicId || !verified?.url) {
        const error = new Error('Verified media identity is incomplete.');
        error.code = 'HERO_MEDIA_VERIFICATION_INCOMPLETE';
        throw error;
    }
    const sourceInput = source || {
        sourceType: 'ADMIN_UPLOAD',
        sourceProvider: 'cloudinary',
        sourceReference: verified.publicId,
        originalUrlHash: '',
        rightsStatus: 'USER_OWNED',
        provenance: { method: 'admin-upload' },
    };
    const sourceIdentity = sourceInput.sourceIdentity || sourceIdentityFor({
        movieId: id,
        sourceType: sourceInput.sourceType,
        sourceReference: sourceInput.sourceReference,
        originalUrlHash: sourceInput.originalUrlHash,
    });
    const [targetMovie, duplicateUrl, duplicatePublicId, duplicateMovie] = await Promise.all([
        Movie.exists({ _id: id }),
        HeroMediaAsset.exists({
            secureUrl: verified.url,
            sourceIdentity: { $ne: sourceIdentity },
            status: 'ready',
        }),
        HeroMediaAsset.exists({
            cloudinaryPublicId: verified.publicId,
            sourceIdentity: { $ne: sourceIdentity },
            status: 'ready',
        }),
        Movie.exists({
            _id: { $ne: id },
            heroVideoUrl: verified.url,
            heroVideoStatus: 'ready',
        }),
    ]);
    if (duplicateUrl || duplicateMovie) {
        const error = new Error('A verified native trailer URL is already registered.');
        error.code = 'HERO_MEDIA_DUPLICATE';
        error.status = 409;
        throw error;
    }
    if (duplicatePublicId) {
        const error = new Error('A Cloudinary Hero asset is already registered.');
        error.code = 'HERO_MEDIA_DUPLICATE';
        error.status = 409;
        throw error;
    }
    if (!targetMovie) {
        const error = new Error('Movie not found.');
        error.code = 'HERO_MOVIE_NOT_FOUND';
        error.status = 404;
        throw error;
    }
    const [videoCodec = '', audioCodec = ''] = String(verified.codec || '').split('/');
    const filter = assetId ? { _id: assetId, movieId: id } : { movieId: id, sourceIdentity };
    const asset = await HeroMediaAsset.findOneAndUpdate(
        filter,
        {
            $setOnInsert: { movieId: id, sourceIdentity },
            $set: {
                source: {
                    type: sourceInput.sourceType,
                    provider: sourceInput.sourceProvider || '',
                    reference: sourceInput.sourceReference || verified.publicId,
                    originalUrl: sourceInput.originalUrl || '',
                    originalUrlHash: sourceInput.originalUrlHash || '',
                },
                rights: {
                    status: sourceInput.rightsStatus || 'USER_OWNED',
                    approvedAt: sourceInput.approvedAt || new Date(),
                    approvedBy: sourceInput.approvedBy || '',
                    provenance: sourceInput.provenance || null,
                },
                sourceStatus: 'ready_for_ingestion',
                status: 'ready',
                cloudinaryPublicId: verified.publicId,
                secureUrl: verified.url,
                posterUrl: verified.posterUrl,
                mimeType: verified.mimeType,
                format: String(verified.mimeType || '').split('/')[1] || '',
                duration: verified.duration,
                width: verified.width,
                height: verified.height,
                bytes: verified.bytes,
                videoCodec,
                audioCodec,
                checksum: verified.checksum || '',
                attribution: verified.attribution || '',
                verificationStatus: 'verified',
                verificationReasons: [],
                verifiedAt: verified.verifiedAt || new Date(),
                failure: {},
            },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true },
    ).lean();
    if (updateMovie) {
        await syncMovieFromReadyHeroMediaAsset(asset);
    }
    return asset;
};

export const retireHeroMediaAsset = async ({ movieId, publicId }) => HeroMediaAsset.updateMany(
    {
        movieId: String(movieId || '').trim(),
        cloudinaryPublicId: String(publicId || '').trim(),
        status: { $ne: 'retired' },
    },
    { $set: { status: 'retired' } },
);

export const getHeroMediaDiagnostics = async () => {
    if (mongoose.connection.readyState !== 1) {
        return {
            ready: 0,
            pending: 0,
            ingesting: 0,
            processing: 0,
            failed: 0,
            failures: [],
        };
    }
    const rows = await HeroMediaAsset.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const counts = Object.fromEntries(rows.map((row) => [row._id, row.count]));
    const failures = await HeroMediaAsset.find({ status: 'failed' })
        .select('movieId source sourceStatus failure updatedAt')
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean();
    return {
        ready: Number(counts.ready || 0),
        pending: Number(counts.pending || 0),
        ingesting: Number(counts.ingesting || 0),
        processing: Number(counts.processing || 0),
        failed: Number(counts.failed || 0),
        failures: failures.map((asset) => ({
            movieId: asset.movieId,
            sourceType: asset.source?.type || '',
            sourceStatus: asset.sourceStatus,
            failureCode: asset.failure?.code || '',
            updatedAt: asset.updatedAt,
        })),
    };
};

export const getHeroMediaStates = async (movieIds = []) => {
    if (mongoose.connection.readyState !== 1 || !movieIds.length) return new Map();
    const assets = await HeroMediaAsset.find({
        movieId: { $in: movieIds.map(String) },
        status: { $ne: 'retired' },
    })
        .select('movieId source rights status sourceStatus verificationStatus failure updatedAt')
        .sort({ verifiedAt: -1, updatedAt: -1 })
        .lean();
    const byMovieId = new Map();
    for (const asset of assets) {
        if (!byMovieId.has(String(asset.movieId))) byMovieId.set(String(asset.movieId), {
            id: String(asset._id),
            status: asset.status,
            sourceType: asset.source?.type || '',
            sourceStatus: asset.sourceStatus,
            rightsStatus: asset.rights?.status || 'UNKNOWN',
            verificationStatus: asset.verificationStatus,
            failureCode: asset.failure?.code || '',
            updatedAt: asset.updatedAt,
        });
    }
    return byMovieId;
};

export { movieFieldsFromVerifiedAsset };
