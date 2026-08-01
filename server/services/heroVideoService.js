import { cloudinary } from '../configs/cloudinary.js';
import {
    HERO_VIDEO_MAX_BYTES,
    HERO_VIDEO_MAX_DURATION_SECONDS,
    HERO_VIDEO_MIN_HEIGHT,
    HERO_VIDEO_MIN_WIDTH,
    HERO_VIDEO_ORPHAN_GRACE_SECONDS,
    isHeroVideoCodecPairSupported,
} from '../configs/heroRotation.js';
import HeroRotationBatch from '../models/HeroRotationBatch.js';
import Movie from '../models/Movie.js';
import SiteConfig from '../models/SiteConfig.js';
import { deleteByPattern, deleteKeys } from './cacheService.js';
import {
    acquireFencedLock,
    releaseFencedLock,
    renewFencedLock,
    verifyFencedLock,
} from './lockService.js';
import { redisKeys, redisTtl } from './redisKeys.js';

const SUPPORTED_FORMATS = new Set(['mp4', 'webm']);

export const heroVideoRuntime = {
    acquireFencedLock,
    deleteByPattern,
    deleteKeys,
    releaseFencedLock,
    renewFencedLock,
    verifyFencedLock,
    attemptActivation: async (options = {}) => {
        try {
            const { refreshHeroRotation } = await import('./heroRotationService.js');
            const activationOptions = options && typeof options === 'object' ? options : {};
            return await refreshHeroRotation({
                ...activationOptions,
                source: activationOptions.source || 'admin',
                requestedBy: activationOptions.requestedBy || 'hero-video-commit',
                force: activationOptions.force ?? true,
            });
        } catch (error) {
            return {
                activated: false,
                code: error?.code || 'HERO_ACTIVATION_PENDING',
                message: error?.message || 'Hero activation is pending.',
            };
        }
    },
};

export class HeroVideoError extends Error {
    constructor(code, message, status = 400, details) {
        super(message);
        this.name = 'HeroVideoError';
        this.code = code;
        this.status = status;
        this.statusCode = status;
        this.details = details;
    }
}

const requireCloudinaryConfig = () => {
    const missing = [
        ['CLOUDINARY_NAME', process.env.CLOUDINARY_NAME],
        ['CLOUDINARY_API_KEY', process.env.CLOUDINARY_API_KEY],
        ['CLOUDINARY_SECRET_KEY', process.env.CLOUDINARY_SECRET_KEY],
    ].filter(([, value]) => !String(value || '').trim()).map(([name]) => name);
    if (missing.length) {
        throw new HeroVideoError(
            'CLOUDINARY_NOT_CONFIGURED',
            'Cloudinary Hero video storage is not configured.',
            503,
            { missing },
        );
    }
};

const normalizeMovieId = (movieId) => {
    const id = String(movieId || '').trim();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
        throw new HeroVideoError('HERO_MOVIE_ID_INVALID', 'Invalid Hero movie ID.', 400);
    }
    return id;
};

const movieFolder = (movieId) => `hero_trailers/${normalizeMovieId(movieId)}`;

export const getUploadSignature = async (movieId) => {
    requireCloudinaryConfig();
    const id = normalizeMovieId(movieId);
    if (!await Movie.exists({ _id: id })) {
        throw new HeroVideoError('HERO_MOVIE_NOT_FOUND', 'Movie not found.', 404);
    }
    const timestamp = Math.round(Date.now() / 1000);
    const folder = movieFolder(id);
    const context = `movie_id=${id}`;
    const signature = cloudinary.utils.api_sign_request(
        { timestamp, folder, context },
        process.env.CLOUDINARY_SECRET_KEY,
    );
    return {
        timestamp,
        signature,
        cloudName: process.env.CLOUDINARY_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        folder,
        context,
        acceptedFormats: [...SUPPORTED_FORMATS],
    };
};

const getAssetCodec = (asset) => String(
    asset?.video?.codec
    || asset?.video_codec
    || asset?.metadata?.video_codec
    || '',
).toLowerCase();

const getAssetAudioCodec = (asset) => String(
    asset?.audio?.codec
    || asset?.audio_codec
    || asset?.metadata?.audio_codec
    || '',
).toLowerCase();

const buildPosterUrl = (secureUrl) => {
    const parsed = new URL(secureUrl);
    const transformed = parsed.pathname.replace('/video/upload/', '/video/upload/so_0,f_jpg,q_auto/');
    parsed.pathname = transformed.replace(/\.(?:mp4|webm)$/i, '.jpg');
    parsed.search = '';
    return parsed.toString();
};

export const verifyUploadedHeroVideo = async (movieId, publicId) => {
    requireCloudinaryConfig();
    const id = normalizeMovieId(movieId);
    const assetId = String(publicId || '').trim();
    const expectedPrefix = `${movieFolder(id)}/`;
    if (
        !assetId.startsWith(expectedPrefix)
        || assetId.length > 240
        || assetId.includes('..')
        || !/^[a-zA-Z0-9_./-]+$/.test(assetId)
    ) {
        throw new HeroVideoError(
            'HERO_VIDEO_BINDING_INVALID',
            'The uploaded asset must be stored in the selected movie folder.',
            400,
        );
    }
    const asset = await cloudinary.api.resource(assetId, {
        resource_type: 'video',
        image_metadata: true,
        media_metadata: true,
        context: true,
    });
    const format = String(asset?.format || '').toLowerCase();
    const secureUrl = String(asset?.secure_url || '');
    if (
        asset?.public_id !== assetId
        || asset?.resource_type !== 'video'
        || !SUPPORTED_FORMATS.has(format)
    ) {
        throw new HeroVideoError(
            'HERO_VIDEO_FORMAT_INVALID',
            'Uploaded Hero asset is not a supported native video.',
            400,
        );
    }
    let parsedUrl;
    try {
        parsedUrl = new URL(secureUrl);
    } catch {
        throw new HeroVideoError('HERO_VIDEO_URL_INVALID', 'Cloudinary returned an invalid asset URL.', 502);
    }
    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'res.cloudinary.com') {
        throw new HeroVideoError(
            'HERO_VIDEO_HOST_INVALID',
            'Uploaded Hero asset is not hosted by the trusted CDN.',
            400,
        );
    }
    const bytes = Number(asset?.bytes);
    const duration = Number(asset?.duration);
    const width = Number(asset?.width);
    const height = Number(asset?.height);
    if (
        !Number.isFinite(bytes) || bytes <= 0 || bytes > HERO_VIDEO_MAX_BYTES
        || !Number.isFinite(duration) || duration <= 0 || duration > HERO_VIDEO_MAX_DURATION_SECONDS
        || !Number.isFinite(width) || width < HERO_VIDEO_MIN_WIDTH
        || !Number.isFinite(height) || height < HERO_VIDEO_MIN_HEIGHT
    ) {
        throw new HeroVideoError(
            'HERO_VIDEO_METADATA_INVALID',
            'Hero video size, duration, or dimensions are outside the configured limits.',
            400,
            { bytes, duration, width, height },
        );
    }
    const videoCodec = getAssetCodec(asset);
    const audioCodec = getAssetAudioCodec(asset);
    const mimeType = `video/${format}`;
    if (!isHeroVideoCodecPairSupported({ mimeType, videoCodec, audioCodec })) {
        throw new HeroVideoError(
            'HERO_VIDEO_CODEC_INVALID',
            'Hero video must use a container-compatible video and audio codec.',
            400,
            { mimeType, videoCodec, audioCodec },
        );
    }
    const contextMovieId = String(
        asset?.context?.custom?.movie_id
        || asset?.context?.movie_id
        || '',
    );
    if (contextMovieId !== id) {
        throw new HeroVideoError(
            'HERO_VIDEO_CONTEXT_MISMATCH',
            'Cloudinary asset metadata must identify the selected movie.',
            400,
        );
    }
    return {
        publicId: assetId,
        movieId: id,
        url: parsedUrl.toString(),
        mimeType,
        posterUrl: buildPosterUrl(parsedUrl.toString()),
        bytes,
        duration,
        width,
        height,
        codec: [videoCodec, audioCodec].filter(Boolean).join('/'),
        source: 'cloudinary',
        attribution: String(asset?.context?.custom?.attribution || ''),
        checksum: String(asset?.etag || ''),
        verifiedAt: new Date(),
    };
};

export const invalidateHeroVideoCaches = async () => {
    await heroVideoRuntime.deleteKeys(redisKeys.homeHero(), redisKeys.heroLastGood());
    await heroVideoRuntime.deleteByPattern(redisKeys.homeHeroPattern());
    await heroVideoRuntime.deleteByPattern(redisKeys.heroActivePattern());
};

export const bumpHeroVideoCacheGeneration = async () => SiteConfig.updateOne(
    { key: 'heroRotation' },
    {
        $setOnInsert: { key: 'heroRotation' },
        $inc: { 'heroRotation.cacheGeneration': 1 },
    },
    { upsert: true },
);

export const commitHeroVideo = async (movieId, { publicId } = {}) => {
    const id = normalizeMovieId(movieId);
    const movie = await withHeroMutationLock(async (lock, assertLease) => {
        const target = await Movie.findById(id);
        if (!target) throw new HeroVideoError('HERO_MOVIE_NOT_FOUND', 'Movie not found.', 404);
        const verified = await verifyUploadedHeroVideo(id, publicId);
        const duplicate = await Movie.exists({
            _id: { $ne: id },
            heroVideoUrl: verified.url,
        });
        if (duplicate) {
            throw new HeroVideoError(
                'HERO_VIDEO_DUPLICATE',
                'A native trailer URL cannot be shared by multiple movies.',
                409,
            );
        }
        await assertLease();
        target.heroVideoId = verified.publicId;
        target.heroVideoPublicId = verified.publicId;
        target.heroVideoStorageProvider = 'cloudinary';
        target.heroVideoStorageId = verified.publicId;
        target.heroVideoMovieId = id;
        target.heroVideoUrl = verified.url;
        target.heroVideoMimeType = verified.mimeType;
        target.heroVideoPosterUrl = verified.posterUrl;
        target.heroVideoStatus = 'ready';
        target.heroVideoVersion = Date.now().toString();
        target.heroVideoDuration = verified.duration;
        target.heroVideoWidth = verified.width;
        target.heroVideoHeight = verified.height;
        target.heroVideoBytes = verified.bytes;
        target.heroVideoCodec = verified.codec;
        target.heroVideoVerifiedAt = verified.verifiedAt;
        target.heroVideoSource = verified.source;
        target.heroVideoAttribution = verified.attribution;
        target.heroVideoChecksum = verified.checksum;
        // Advance the generation before the durable movie write. If the write fails,
        // the extra cache miss is safe; a successful write can never remain hidden
        // behind an older generation after a crash between these operations.
        await bumpHeroVideoCacheGeneration();
        await target.save();
        await invalidateHeroVideoCaches();
        return target;
    });
    const activation = await heroVideoRuntime.attemptActivation();
    return { movie, activation };
};

export const withHeroMutationLock = async (task) => {
    const config = await SiteConfig.findOne({ key: 'heroRotation' })
        .select('heroRotation.lastFencingToken')
        .lean();
    const lock = await heroVideoRuntime.acquireFencedLock(
        redisKeys.heroRefreshLock(),
        redisKeys.heroRefreshFence(),
        {
            ttlMs: redisTtl.heroRefreshLockMs,
            waitMs: 10000,
            minimumFencingToken: config?.heroRotation?.lastFencingToken || 0,
        },
    );
    let lost = false;
    const heartbeat = setInterval(async () => {
        try {
            if (!await heroVideoRuntime.renewFencedLock(lock)) lost = true;
        } catch {
            lost = true;
        }
    }, Math.min(30000, Math.floor(redisTtl.heroRefreshLockMs / 4)));
    heartbeat.unref?.();
    const assertLease = async () => {
        if (lost || !await heroVideoRuntime.verifyFencedLock(lock)) {
            throw new HeroVideoError(
                'HERO_VIDEO_MUTATION_LOCK_LOST',
                'Hero video mutation lease was lost.',
                409,
            );
        }
    };
    try {
        await assertLease();
        return await task(lock, assertLease);
    } finally {
        clearInterval(heartbeat);
        await heroVideoRuntime.releaseFencedLock(lock);
    }
};

export const removeHeroVideo = async (movieId) => {
    const id = normalizeMovieId(movieId);
    return withHeroMutationLock(async (lock, assertLease) => {
        const activeBatch = await HeroRotationBatch.findOne({
            status: 'active',
            movieIds: id,
        }).select('_id').lean();
        if (activeBatch) {
            throw new HeroVideoError(
                'HERO_VIDEO_IN_ACTIVE_POOL',
                'Replace or retire the active Hero pool before removing this trailer.',
                409,
            );
        }
        const target = await Movie.findById(id);
        if (!target) throw new HeroVideoError('HERO_MOVIE_NOT_FOUND', 'Movie not found.', 404);
        const storedPublicId = target.heroVideoId;
        await assertLease();
        target.heroVideoId = '';
        target.heroVideoPublicId = '';
        target.heroVideoStorageProvider = '';
        target.heroVideoStorageId = '';
        target.heroVideoMovieId = '';
        target.heroVideoUrl = '';
        target.heroVideoMimeType = '';
        target.heroVideoPosterUrl = '';
        target.heroVideoStatus = 'missing';
        target.heroVideoVersion = Date.now().toString();
        target.heroVideoDuration = 0;
        target.heroVideoWidth = 0;
        target.heroVideoHeight = 0;
        target.heroVideoBytes = 0;
        target.heroVideoCodec = '';
        target.heroVideoVerifiedAt = null;
        target.heroVideoSource = '';
        target.heroVideoAttribution = '';
        target.heroVideoChecksum = '';
        await bumpHeroVideoCacheGeneration();
        await target.save();
        await invalidateHeroVideoCaches();
        if (storedPublicId) {
            try {
                await cloudinary.uploader.destroy(storedPublicId, { resource_type: 'video' });
            } catch (error) {
                console.warn('[Cloudinary] Hero asset cleanup deferred:', error.message);
            }
            await assertLease();
        }
        return target;
    });
};

export const reconcileHeroAssets = async () => {
    requireCloudinaryConfig();
    let nextCursor = null;
    let deletedCount = 0;
    const observedIds = new Set();
    do {
        const result = await cloudinary.api.resources({
            type: 'upload',
            prefix: 'hero_trailers/',
            resource_type: 'video',
            max_results: 500,
            next_cursor: nextCursor,
        });
        const resources = result.resources || [];
        resources.forEach((resource) => {
            if (resource?.public_id) observedIds.add(resource.public_id);
        });
        const cutoff = Date.now() - (HERO_VIDEO_ORPHAN_GRACE_SECONDS * 1000);
        const orphanCandidates = resources
            .filter((resource) => {
                const createdAt = Date.parse(resource?.created_at || '');
                return resource?.public_id
                    && Number.isFinite(createdAt)
                    && createdAt <= cutoff;
            })
            .map((resource) => resource.public_id);
        if (orphanCandidates.length) {
            deletedCount += await withHeroMutationLock(async (lock, assertLease) => {
                const referenced = await Movie.find({
                    heroVideoId: { $in: orphanCandidates },
                }).select('heroVideoId').lean();
                const referencedIds = new Set(referenced.map((movie) => movie.heroVideoId));
                const orphans = orphanCandidates.filter((publicId) => !referencedIds.has(publicId));
                if (!orphans.length) return 0;
                await assertLease();
                await cloudinary.api.delete_resources(orphans, { resource_type: 'video' });
                await assertLease();
                return orphans.length;
            });
        }
        nextCursor = result.next_cursor || null;
    } while (nextCursor);

    const referencedMovies = await Movie.find({
        heroVideoId: { $ne: '' },
        heroVideoStatus: 'ready',
    }).select('_id heroVideoId').lean();
    const missingCandidates = referencedMovies.filter(
        (movie) => !observedIds.has(movie.heroVideoId),
    );
    let missingReferencedCount = 0;
    if (missingCandidates.length) {
        missingReferencedCount = await withHeroMutationLock(async (lock, assertLease) => {
            const stillMissing = [];
            for (const candidate of missingCandidates) {
                await assertLease();
                try {
                    await cloudinary.api.resource(candidate.heroVideoId, { resource_type: 'video' });
                } catch (error) {
                    const status = Number(error?.http_code || error?.status || error?.statusCode);
                    if (status === 404) {
                        stillMissing.push(candidate);
                        continue;
                    }
                    throw error;
                }
            }
            if (!stillMissing.length) return 0;
            await bumpHeroVideoCacheGeneration();
            const result = await Movie.bulkWrite(
                stillMissing.map((candidate) => ({
                    updateOne: {
                        filter: {
                            _id: candidate._id,
                            heroVideoStatus: 'ready',
                            heroVideoId: candidate.heroVideoId,
                        },
                        update: {
                            $set: {
                                heroVideoStatus: 'missing',
                                heroVideoVerifiedAt: null,
                                heroVideoVersion: Date.now().toString(),
                            },
                        },
                    },
                })),
                { ordered: false },
            );
            if (result.modifiedCount > 0) {
                await invalidateHeroVideoCaches();
            }
            return result.modifiedCount;
        });
    }
    return { success: true, deletedCount, missingReferencedCount };
};

export default {
    getUploadSignature,
    commitHeroVideo,
    removeHeroVideo,
    reconcileHeroAssets,
    verifyUploadedHeroVideo,
};
