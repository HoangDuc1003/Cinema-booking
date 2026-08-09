import { cloudinary } from '../configs/cloudinary.js';
import HeroMediaAsset from '../models/HeroMediaAsset.js';
import Movie from '../models/Movie.js';
import {
    createHeroMediaSourceIdentity,
    recordHeroMediaFailure,
    recordVerifiedHeroMediaAsset,
} from './heroMediaAssetService.js';
import {
    assertMediaSourceMayIngest,
    assertAuthorizedRemoteSourceNetworkSafe,
    isTransientMediaError,
    MediaSourceError,
    resolveMediaSource,
} from './mediaSourceResolver.js';
import { verifyUploadedHeroVideo } from './heroVideoService.js';

export const heroMediaIngestionRuntime = {
    upload: (...args) => cloudinary.uploader.upload(...args),
    probeRemoteSource: (...args) => assertAuthorizedRemoteSourceNetworkSafe(...args),
    verify: (...args) => verifyUploadedHeroVideo(...args),
    reconcile: async () => {
        const { reconcilePreparingHeroBatches } = await import('./heroRotationService.js');
        return reconcilePreparingHeroBatches({ source: 'media-verification' });
    },
};

const movieFolder = (movieId) => `hero_trailers/${String(movieId).trim()}`;

const toSafeAsset = (asset) => ({
    id: String(asset?._id || ''),
    movieId: String(asset?.movieId || ''),
    status: asset?.status || 'pending',
    sourceType: asset?.source?.type || '',
    sourceProvider: asset?.source?.provider || '',
    sourceReference: asset?.source?.reference || '',
    sourceStatus: asset?.sourceStatus || 'needs_authorized_source',
    rightsStatus: asset?.rights?.status || 'UNKNOWN',
    verificationStatus: asset?.verificationStatus || 'unverified',
    failureCode: asset?.failure?.code || '',
    verifiedAt: asset?.verifiedAt || null,
    updatedAt: asset?.updatedAt || null,
});

const toSourceRecord = (resolved, { approvedBy } = {}) => ({
    sourceType: resolved.sourceType,
    sourceProvider: resolved.sourceProvider,
    sourceReference: resolved.sourceReference,
    originalUrl: resolved.downloadableUrl,
    originalUrlHash: resolved.originalUrlHash,
    rightsStatus: resolved.rightsStatus,
    approvedAt: resolved.ingestionAllowed ? new Date() : null,
    approvedBy: String(approvedBy || '').trim(),
    provenance: resolved.provenance,
});

/** Persists authorization before a queue worker gets a remote URL. */
export const requestHeroMediaSource = async ({
    movieId,
    sourceType,
    sourceProvider,
    sourceReference,
    sourceUrl,
    rightsStatus,
    rightsConfirmed,
    provenance,
    expiresAt,
    approvedBy,
} = {}) => {
    const resolved = resolveMediaSource({
        movieId,
        sourceType,
        sourceProvider,
        sourceReference,
        sourceUrl,
        rightsStatus,
        provenance,
        expiresAt,
    });
    const movie = await Movie.exists({ _id: resolved.movieId });
    if (!movie) {
        throw new MediaSourceError('HERO_MOVIE_NOT_FOUND', 'Movie not found.', { status: 404 });
    }
    if (resolved.ingestionAllowed && rightsConfirmed !== true) {
        throw new MediaSourceError(
            'HERO_MEDIA_RIGHTS_CONFIRMATION_REQUIRED',
            'Administrator confirmation is required before a remote source can be ingested.',
            { status: 422 },
        );
    }
    const source = toSourceRecord(resolved, { approvedBy });
    const sourceIdentity = createHeroMediaSourceIdentity({
        movieId: resolved.movieId,
        ...source,
    });
    const existing = await HeroMediaAsset.findOne({ movieId: resolved.movieId, sourceIdentity })
        .select('+source.originalUrl')
        .lean();
    if (existing?.status === 'ready') {
        return { asset: toSafeAsset(existing), reused: true, shouldEnqueue: false };
    }
    const status = resolved.ingestionAllowed ? 'pending' : 'pending';
    const asset = await HeroMediaAsset.findOneAndUpdate(
        { movieId: resolved.movieId, sourceIdentity },
        {
            $setOnInsert: { movieId: resolved.movieId, sourceIdentity },
            $set: {
                source: {
                    type: source.sourceType,
                    provider: source.sourceProvider,
                    reference: source.sourceReference,
                    originalUrl: source.originalUrl,
                    originalUrlHash: source.originalUrlHash,
                },
                rights: {
                    status: source.rightsStatus,
                    approvedAt: source.approvedAt,
                    approvedBy: source.approvedBy,
                    provenance: source.provenance,
                },
                expiresAt: resolved.expiresAt,
                status,
                sourceStatus: resolved.sourceStatus,
                verificationStatus: 'unverified',
                verificationReasons: resolved.ingestionAllowed ? [] : ['NEEDS_AUTHORIZED_SOURCE'],
                failure: resolved.ingestionAllowed ? {} : {
                    code: 'NEEDS_AUTHORIZED_SOURCE',
                    message: 'A YouTube or unknown reference cannot be automatically rehosted.',
                    transient: false,
                    occurredAt: new Date(),
                },
            },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true },
    ).lean();
    return {
        asset: toSafeAsset(asset),
        reused: false,
        shouldEnqueue: resolved.ingestionAllowed,
    };
};

export const ingestAuthorizedHeroMedia = async ({ assetId } = {}) => {
    const asset = await HeroMediaAsset.findById(assetId).select('+source.originalUrl').lean();
    if (!asset) {
        const error = new Error('Hero media asset not found.');
        error.code = 'HERO_MEDIA_ASSET_NOT_FOUND';
        error.status = 404;
        throw error;
    }
    if (asset.status === 'ready') return { asset: toSafeAsset(asset), reused: true, shouldVerify: false };
    const resolved = resolveMediaSource({
        movieId: asset.movieId,
        sourceType: asset.source?.type,
        sourceProvider: asset.source?.provider,
        sourceReference: asset.source?.reference,
        sourceUrl: asset.source?.originalUrl,
        rightsStatus: asset.rights?.status,
        provenance: asset.rights?.provenance,
        expiresAt: asset.expiresAt,
    });
    assertMediaSourceMayIngest(resolved);
    const claimed = await HeroMediaAsset.findOneAndUpdate(
        {
            _id: asset._id,
            status: { $in: ['pending', 'failed'] },
            sourceStatus: 'ready_for_ingestion',
        },
        {
            $set: {
                status: 'ingesting',
                verificationStatus: 'processing',
                verificationReasons: [],
                failure: {},
                lastIngestionAt: new Date(),
            },
            $inc: { ingestionAttempts: 1 },
        },
        { returnDocument: 'after' },
    ).lean();
    if (!claimed) {
        const current = await HeroMediaAsset.findById(asset._id).lean();
        return { asset: toSafeAsset(current), reused: true, shouldVerify: current?.status === 'processing' };
    }
    try {
        const remoteUrl = await heroMediaIngestionRuntime.probeRemoteSource(resolved.downloadableUrl);
        const result = await heroMediaIngestionRuntime.upload(remoteUrl, {
            resource_type: 'video',
            folder: movieFolder(asset.movieId),
            public_id: `remote-${String(asset._id)}`,
            overwrite: false,
            context: {
                movie_id: String(asset.movieId),
                source_type: resolved.sourceType,
                source_reference: resolved.sourceReference,
            },
            eager: [{ format: 'mp4', video_codec: 'h264', audio_codec: 'aac' }],
        });
        const publicId = String(result?.public_id || '').trim();
        if (!publicId) {
            const error = new Error('Cloudinary did not return a public asset ID.');
            error.code = 'HERO_MEDIA_CLOUDINARY_RESPONSE_INVALID';
            throw error;
        }
        const processing = await HeroMediaAsset.findByIdAndUpdate(
            asset._id,
            {
                $set: {
                    status: 'processing',
                    cloudinaryPublicId: publicId,
                    verificationStatus: 'processing',
                },
            },
            { returnDocument: 'after' },
        ).lean();
        return { asset: toSafeAsset(processing), reused: false, shouldVerify: true };
    } catch (error) {
        const recorded = await recordHeroMediaFailure(asset._id, {
            code: error?.code,
            message: error?.message,
            transient: isTransientMediaError(error),
        });
        error.transient = isTransientMediaError(error);
        error.asset = toSafeAsset(recorded);
        throw error;
    }
};

export const retryHeroMediaSource = async ({ assetId } = {}) => {
    const asset = await HeroMediaAsset.findById(assetId).select('+source.originalUrl').lean();
    if (!asset) {
        const error = new Error('Hero media asset not found.');
        error.code = 'HERO_MEDIA_ASSET_NOT_FOUND';
        error.status = 404;
        throw error;
    }
    const resolved = resolveMediaSource({
        movieId: asset.movieId,
        sourceType: asset.source?.type,
        sourceProvider: asset.source?.provider,
        sourceReference: asset.source?.reference,
        sourceUrl: asset.source?.originalUrl,
        rightsStatus: asset.rights?.status,
        provenance: asset.rights?.provenance,
        expiresAt: asset.expiresAt,
    });
    assertMediaSourceMayIngest(resolved);
    const retried = await HeroMediaAsset.findOneAndUpdate(
        { _id: asset._id, status: { $in: ['failed', 'pending'] } },
        {
            $set: {
                status: 'pending',
                sourceStatus: 'ready_for_ingestion',
                verificationStatus: 'unverified',
                verificationReasons: [],
                failure: {},
            },
        },
        { returnDocument: 'after' },
    ).lean();
    if (!retried) {
        const error = new Error('Only pending or failed media assets can be retried.');
        error.code = 'HERO_MEDIA_RETRY_INVALID_STATE';
        error.status = 409;
        throw error;
    }
    return toSafeAsset(retried);
};

export const verifyIngestedHeroMedia = async ({ assetId, reconcile = true } = {}) => {
    const asset = await HeroMediaAsset.findById(assetId).select('+source.originalUrl').lean();
    if (!asset) {
        const error = new Error('Hero media asset not found.');
        error.code = 'HERO_MEDIA_ASSET_NOT_FOUND';
        error.status = 404;
        throw error;
    }
    if (asset.status === 'ready') return { asset: toSafeAsset(asset), activation: null, reused: true };
    if (asset.status !== 'processing' || !asset.cloudinaryPublicId) {
        const error = new Error('Hero media asset is not ready for verification.');
        error.code = 'HERO_MEDIA_NOT_PROCESSING';
        error.status = 409;
        throw error;
    }
    try {
        const verified = await heroMediaIngestionRuntime.verify(asset.movieId, asset.cloudinaryPublicId);
        const recorded = await recordVerifiedHeroMediaAsset({
            movieId: asset.movieId,
            verified,
            assetId: asset._id,
            source: {
                sourceType: asset.source.type,
                sourceProvider: asset.source.provider,
                sourceReference: asset.source.reference,
                originalUrl: asset.source.originalUrl,
                originalUrlHash: asset.source.originalUrlHash,
                rightsStatus: asset.rights.status,
                approvedAt: asset.rights.approvedAt,
                approvedBy: asset.rights.approvedBy,
                provenance: asset.rights.provenance,
            },
        });
        const activation = reconcile ? await heroMediaIngestionRuntime.reconcile() : null;
        return { asset: toSafeAsset(recorded), activation, reused: false };
    } catch (error) {
        const recorded = await recordHeroMediaFailure(asset._id, {
            code: error?.code,
            message: error?.message,
            transient: isTransientMediaError(error),
        });
        error.transient = isTransientMediaError(error);
        error.asset = toSafeAsset(recorded);
        throw error;
    }
};

export const getSafeHeroMediaAsset = toSafeAsset;
