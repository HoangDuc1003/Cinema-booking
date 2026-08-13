import { cloudinary } from '../configs/cloudinary.js';
import HeroMediaAsset from '../models/HeroMediaAsset.js';
import Movie from '../models/Movie.js';
import {
    createHeroMediaSourceIdentity,
    recordHeroMediaFailure,
    recordHeroMediaVerificationRetry,
    recordVerifiedHeroMediaAsset,
    syncMovieFromReadyHeroMediaAsset,
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
    lookup: (...args) => cloudinary.api.resource(...args),
    probeRemoteSource: (...args) => assertAuthorizedRemoteSourceNetworkSafe(...args),
    verify: (...args) => verifyUploadedHeroVideo(...args),
    now: () => new Date(),
    reconcile: async () => {
        const { reconcilePreparingHeroBatches } = await import('./heroRotationService.js');
        return reconcilePreparingHeroBatches({ source: 'media-verification' });
    },
};

export const HERO_MEDIA_INGEST_LEASE_MS = 5 * 60 * 1000;

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
    ingestionAttempts: Number(asset?.ingestionAttempts || 0),
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
    if (
        existing
        && existing.sourceStatus === 'ready_for_ingestion'
        && ['pending', 'ingesting', 'processing', 'ready', 'failed'].includes(existing.status)
    ) {
        return {
            asset: toSafeAsset(existing),
            reused: true,
            shouldEnqueue: resolved.ingestionAllowed
                && ['pending', 'processing'].includes(existing.status),
        };
    }
    const asset = await HeroMediaAsset.findOneAndUpdate(
        { movieId: resolved.movieId, sourceIdentity },
        {
            $setOnInsert: {
                movieId: resolved.movieId,
                sourceIdentity,
                status: 'pending',
            },
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
        reused: Boolean(existing),
        shouldEnqueue: resolved.ingestionAllowed
            && ['pending', 'processing'].includes(asset.status),
    };
};

const createIngestionLeaseError = (asset) => {
    const lastIngestionAt = new Date(asset?.lastIngestionAt || 0);
    const retryAfter = new Date(Math.max(
        heroMediaIngestionRuntime.now().getTime() + 1000,
        lastIngestionAt.getTime() + HERO_MEDIA_INGEST_LEASE_MS,
    ));
    const error = new Error('Hero media ingestion is already in progress.');
    error.code = 'HERO_MEDIA_INGESTION_LEASED';
    error.status = 409;
    error.transient = true;
    error.retryAfter = retryAfter;
    error.asset = toSafeAsset(asset);
    return error;
};

const transitionRecoveredUploadToProcessing = async (asset, publicId) => {
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
    return { asset: toSafeAsset(processing), reused: true, shouldVerify: true };
};

export const ingestAuthorizedHeroMedia = async ({ assetId } = {}) => {
    const asset = await HeroMediaAsset.findById(assetId).select('+source.originalUrl').lean();
    if (!asset) {
        const error = new Error('Hero media asset not found.');
        error.code = 'HERO_MEDIA_ASSET_NOT_FOUND';
        error.status = 404;
        throw error;
    }
    if (asset.status === 'ready') {
        await syncMovieFromReadyHeroMediaAsset(asset);
        return { asset: toSafeAsset(asset), reused: true, shouldVerify: false };
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
    const now = heroMediaIngestionRuntime.now();
    const staleBefore = new Date(now.getTime() - HERO_MEDIA_INGEST_LEASE_MS);
    if (
        asset.status === 'ingesting'
        && asset.lastIngestionAt
        && new Date(asset.lastIngestionAt) > staleBefore
    ) {
        throw createIngestionLeaseError(asset);
    }
    const claimed = await HeroMediaAsset.findOneAndUpdate(
        {
            _id: asset._id,
            sourceStatus: 'ready_for_ingestion',
            $or: [
                { status: { $in: ['pending', 'failed'] } },
                { status: 'ingesting', lastIngestionAt: { $lte: staleBefore } },
                { status: 'ingesting', lastIngestionAt: null },
            ],
        },
        {
            $set: {
                status: 'ingesting',
                verificationStatus: 'processing',
                verificationReasons: [],
                failure: {},
                lastIngestionAt: now,
            },
            $inc: { ingestionAttempts: 1 },
        },
        { returnDocument: 'after' },
    ).lean();
    if (!claimed) {
        const current = await HeroMediaAsset.findById(asset._id).lean();
        if (current?.status === 'ready') await syncMovieFromReadyHeroMediaAsset(current);
        if (current?.status === 'ingesting') throw createIngestionLeaseError(current);
        return {
            asset: toSafeAsset(current),
            reused: true,
            shouldVerify: current?.status === 'processing',
        };
    }
    const expectedPublicId = `${movieFolder(asset.movieId)}/remote-${String(asset._id)}`;
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
        try {
            const recovered = await heroMediaIngestionRuntime.lookup(expectedPublicId, {
                resource_type: 'video',
                context: true,
            });
            if (String(recovered?.public_id || '') === expectedPublicId) {
                return transitionRecoveredUploadToProcessing(asset, expectedPublicId);
            }
        } catch {
            // No deterministic Cloudinary asset exists; preserve the original failure.
        }
        const transient = isTransientMediaError(error);
        const recorded = await recordHeroMediaFailure(asset._id, {
            code: error?.code,
            message: error?.message,
            transient,
        });
        error.transient = transient;
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
    if (asset.status === 'ready') {
        await syncMovieFromReadyHeroMediaAsset(asset);
        const activation = reconcile ? await heroMediaIngestionRuntime.reconcile() : null;
        return { asset: toSafeAsset(asset), activation, reused: true };
    }
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
        const current = await HeroMediaAsset.findById(asset._id).lean().catch(() => null);
        if (current?.status === 'ready' && current?.verificationStatus === 'verified') {
            error.transient = true;
            error.asset = toSafeAsset(current);
            throw error;
        }
        const transient = isTransientMediaError(error);
        const failure = {
            code: error?.code,
            message: error?.message,
            transient,
        };
        const recorded = transient
            ? await recordHeroMediaVerificationRetry(asset._id, failure)
            : await recordHeroMediaFailure(asset._id, failure);
        error.transient = transient;
        error.asset = toSafeAsset(recorded);
        throw error;
    }
};

export const getSafeHeroMediaAsset = toSafeAsset;
