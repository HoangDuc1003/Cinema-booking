import CatalogBatch from '../models/CatalogBatch.js';
import Movie from '../models/Movie.js';
import { cloudinary } from '../configs/cloudinary.js';
import {
    bumpHeroVideoCacheGeneration,
    HeroVideoError,
    heroVideoRuntime,
    invalidateHeroVideoCaches,
    verifyUploadedHeroVideo,
    withHeroMutationLock,
} from './heroVideoService.js';

const hasCloudinaryConfig = () => Boolean(
    process.env.CLOUDINARY_NAME
    && process.env.CLOUDINARY_API_KEY
    && process.env.CLOUDINARY_SECRET_KEY
);

const loadTargetMovieIds = async ({ batchId, movieIds }) => {
    const explicit = Array.isArray(movieIds) ? movieIds.map(String).filter(Boolean) : [];
    if (explicit.length) return [...new Set(explicit)];
    let batch = batchId ? await CatalogBatch.findById(batchId).lean() : null;
    if (!batch || batch.status !== 'active') {
        batch = await CatalogBatch.findOne({ status: 'active' }).lean();
    }
    if (Array.isArray(batch?.movieIds) && batch.movieIds.length) {
        return [...new Set(batch.movieIds.map(String))];
    }
    return [];
};

const listMovieSpecificAssets = async () => {
    const assets = [];
    let nextCursor = null;
    do {
        const result = await cloudinary.api.resources({
            type: 'upload',
            prefix: 'hero_trailers/',
            resource_type: 'video',
            max_results: 500,
            next_cursor: nextCursor,
            context: true,
        });
        assets.push(...(result.resources || []));
        nextCursor = result.next_cursor || null;
    } while (nextCursor);
    return assets;
};

const movieIdFromPublicId = (publicId) => {
    const match = /^hero_trailers\/([a-zA-Z0-9_-]{1,100})\/[a-zA-Z0-9_./-]+$/.exec(
        String(publicId || ''),
    );
    return match?.[1] || '';
};

/**
 * Reconciles only movie-specific Cloudinary uploads. It never fabricates a
 * trailer, never maps one URL to multiple movies, and never promotes an asset
 * until the same verification used by the Admin commit path succeeds.
 */
export const enrichCatalogHeroVideos = async ({
    batchId,
    movieIds,
    force = false,
} = {}) => {
    if (!hasCloudinaryConfig()) {
        throw new HeroVideoError(
            'CLOUDINARY_NOT_CONFIGURED',
            'Cloudinary credentials are required to verify native Hero trailers.',
            503,
        );
    }
    const targetIds = await loadTargetMovieIds({ batchId, movieIds });
    if (!targetIds.length) {
        return {
            success: true,
            verifiedCount: 0,
            missingMovieIds: [],
            invalidAssets: [],
            totalCount: 0,
            activation: null,
        };
    }
    const targetSet = new Set(targetIds);
    const assets = await listMovieSpecificAssets();
    const assetsByMovie = new Map();
    for (const asset of assets) {
        const movieId = movieIdFromPublicId(asset.public_id);
        if (!movieId || !targetSet.has(movieId)) continue;
        const current = assetsByMovie.get(movieId);
        if (!current || Number(asset.created_at ? Date.parse(asset.created_at) : 0) > Number(current.created_at ? Date.parse(current.created_at) : 0)) {
            assetsByMovie.set(movieId, asset);
        }
    }
    const {
        verifiedCount,
        invalidAssets,
        missingMovieIds,
    } = await withHeroMutationLock(async (lock, assertLease) => {
        const movies = await Movie.find({ _id: { $in: targetIds } })
            .select('_id heroVideoStatus heroVideoId heroVideoUrl')
            .lean();
        const moviesById = new Map(movies.map((movie) => [String(movie._id), movie]));
        const operations = [];
        const invalid = [];
        const missing = [];
        const usedUrls = new Set();
        for (const movieId of targetIds) {
            const movie = moviesById.get(movieId);
            const asset = assetsByMovie.get(movieId);
            if (!movie || !asset) {
                missing.push(movieId);
                continue;
            }
            if (!force && movie.heroVideoStatus === 'ready' && movie.heroVideoId === asset.public_id) {
                if (movie.heroVideoUrl) usedUrls.add(movie.heroVideoUrl);
                continue;
            }
            try {
                await assertLease();
                const verified = await verifyUploadedHeroVideo(movieId, asset.public_id);
                if (usedUrls.has(verified.url)) {
                    invalid.push({ movieId, code: 'HERO_VIDEO_DUPLICATE' });
                    continue;
                }
                usedUrls.add(verified.url);
                operations.push({
                    updateOne: {
                        filter: {
                            _id: movieId,
                            heroVideoId: movie.heroVideoId || '',
                        },
                        update: {
                            $set: {
                                heroVideoId: verified.publicId,
                                heroVideoPublicId: verified.publicId,
                                heroVideoStorageProvider: 'cloudinary',
                                heroVideoStorageId: verified.publicId,
                                heroVideoMovieId: movieId,
                                heroVideoUrl: verified.url,
                                heroVideoMimeType: verified.mimeType,
                                heroVideoPosterUrl: verified.posterUrl,
                                heroVideoStatus: 'ready',
                                heroVideoVersion: Date.now().toString(),
                                heroVideoDuration: verified.duration,
                                heroVideoWidth: verified.width,
                                heroVideoHeight: verified.height,
                                heroVideoBytes: verified.bytes,
                                heroVideoCodec: verified.codec,
                                heroVideoVerifiedAt: verified.verifiedAt,
                                heroVideoSource: verified.source,
                                heroVideoAttribution: verified.attribution,
                                heroVideoChecksum: verified.checksum,
                            },
                        },
                    },
                });
            } catch (error) {
                if (
                    !(error instanceof HeroVideoError)
                    || error.code === 'HERO_VIDEO_MUTATION_LOCK_LOST'
                    || Number(error.status || error.statusCode || 0) >= 500
                ) {
                    throw error;
                }
                invalid.push({
                    movieId,
                    code: error?.code || 'HERO_VIDEO_VERIFICATION_FAILED',
                });
            }
        }
        let modifiedCount = 0;
        if (operations.length) {
            await assertLease();
            await bumpHeroVideoCacheGeneration();
            const result = await Movie.bulkWrite(operations, { ordered: false });
            modifiedCount = result.modifiedCount;
            if (modifiedCount > 0) {
                await invalidateHeroVideoCaches();
            }
        }
        return {
            verifiedCount: modifiedCount,
            invalidAssets: invalid,
            missingMovieIds: missing,
        };
    });
    const activation = verifiedCount > 0
        ? await heroVideoRuntime.attemptActivation({
            source: 'enrichment',
            requestedBy: 'catalog-hero-enrichment',
        })
        : null;
    return {
        success: invalidAssets.length === 0 && missingMovieIds.length === 0,
        verifiedCount,
        missingMovieIds,
        invalidAssets,
        totalCount: targetIds.length,
        activation,
    };
};

export default enrichCatalogHeroVideos;
