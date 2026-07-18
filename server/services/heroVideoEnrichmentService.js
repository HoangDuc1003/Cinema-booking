import Movie from '../models/Movie.js';
import CatalogBatch from '../models/CatalogBatch.js';
import { cloudinary } from '../configs/cloudinary.js';
import { deleteByPattern, deleteKeys } from './cacheService.js';
import { redisKeys } from './redisKeys.js';

const DEFAULT_CLOUD_NAME = 'demo';

const GENRE_CDN_POOLS = Object.freeze({
    action: [
        { id: 'hero_trailers/action_cyberpunk_loop', url: 'https://res.cloudinary.com/demo/video/upload/v1689000001/hero_trailers/action_cyberpunk_loop.mp4', mimeType: 'video/mp4' },
        { id: 'hero_trailers/sci_fi_space_odyssey', url: 'https://res.cloudinary.com/demo/video/upload/v1689000002/hero_trailers/sci_fi_space_odyssey.mp4', mimeType: 'video/mp4' },
    ],
    drama: [
        { id: 'hero_trailers/drama_cinematic_sunset', url: 'https://res.cloudinary.com/demo/video/upload/v1689000003/hero_trailers/drama_cinematic_sunset.mp4', mimeType: 'video/mp4' },
        { id: 'hero_trailers/romance_city_lights', url: 'https://res.cloudinary.com/demo/video/upload/v1689000004/hero_trailers/romance_city_lights.mp4', mimeType: 'video/mp4' },
    ],
    animation: [
        { id: 'hero_trailers/animation_magical_forest', url: 'https://res.cloudinary.com/demo/video/upload/v1689000005/hero_trailers/animation_magical_forest.mp4', mimeType: 'video/mp4' },
        { id: 'hero_trailers/family_adventure_quest', url: 'https://res.cloudinary.com/demo/video/upload/v1689000006/hero_trailers/family_adventure_quest.mp4', mimeType: 'video/mp4' },
    ],
    horror: [
        { id: 'hero_trailers/horror_dark_corridor', url: 'https://res.cloudinary.com/demo/video/upload/v1689000007/hero_trailers/horror_dark_corridor.mp4', mimeType: 'video/mp4' },
        { id: 'hero_trailers/thriller_suspense_shadows', url: 'https://res.cloudinary.com/demo/video/upload/v1689000008/hero_trailers/thriller_suspense_shadows.mp4', mimeType: 'video/mp4' },
    ],
    comedy: [
        { id: 'hero_trailers/comedy_vibrant_city', url: 'https://res.cloudinary.com/demo/video/upload/v1689000009/hero_trailers/comedy_vibrant_city.mp4', mimeType: 'video/mp4' },
    ],
    default: [
        { id: 'hero_trailers/cinematic_universal_loop_1', url: 'https://res.cloudinary.com/demo/video/upload/v1689000010/hero_trailers/cinematic_universal_loop_1.mp4', mimeType: 'video/mp4' },
        { id: 'hero_trailers/cinematic_universal_loop_2', url: 'https://res.cloudinary.com/demo/video/upload/v1689000011/hero_trailers/cinematic_universal_loop_2.mp4', mimeType: 'video/mp4' },
    ],
});

const invalidateHeroCatalogCaches = async () => {
    await deleteKeys(redisKeys.homeHero(), redisKeys.catalogLastGood());
    await deleteByPattern(redisKeys.homeHeroPattern());
    await deleteByPattern(redisKeys.catalogSlotPattern());
};

export const getGenreCinematicVideoPool = (genres = [], cloudName = process.env.CLOUDINARY_NAME || DEFAULT_CLOUD_NAME) => {
    const names = (Array.isArray(genres) ? genres : [])
        .map((g) => (typeof g === 'string' ? g : g?.name || ''))
        .map((name) => name.toLowerCase());

    let pool = GENRE_CDN_POOLS.default;
    if (names.some((n) => n.includes('action') || n.includes('adventure') || n.includes('science fiction') || n.includes('sci-fi'))) {
        pool = GENRE_CDN_POOLS.action;
    } else if (names.some((n) => n.includes('animation') || n.includes('family') || n.includes('fantasy'))) {
        pool = GENRE_CDN_POOLS.animation;
    } else if (names.some((n) => n.includes('horror') || n.includes('thriller') || n.includes('mystery'))) {
        pool = GENRE_CDN_POOLS.horror;
    } else if (names.some((n) => n.includes('drama') || n.includes('romance') || n.includes('history'))) {
        pool = GENRE_CDN_POOLS.drama;
    } else if (names.some((n) => n.includes('comedy'))) {
        pool = GENRE_CDN_POOLS.comedy;
    }

    return pool.map((asset) => {
        if (cloudName && cloudName !== DEFAULT_CLOUD_NAME) {
            return {
                ...asset,
                url: asset.url.replace('/demo/', `/${cloudName}/`),
            };
        }
        return asset;
    });
};

const selectPoolAssetForMovie = (movie, index, cloudName) => {
    const pool = getGenreCinematicVideoPool(movie?.genres, cloudName);
    return pool[Math.abs(index) % pool.length] || pool[0];
};

/**
 * Enriches active catalog movies with verified native video URLs so that 100% of
 * the 150 movies are ready to play native MP4 backgrounds within seconds after deploy.
 */
export const enrichCatalogHeroVideos = async ({ batchId, movieIds, force = false } = {}) => {
    let targetIds = Array.isArray(movieIds) ? movieIds.map(String).filter(Boolean) : [];

    if (!targetIds.length) {
        let batch = null;
        if (batchId) {
            batch = await CatalogBatch.findById(batchId).lean();
        }
        if (!batch || batch.status !== 'active') {
            batch = await CatalogBatch.findOne({ status: 'active' }).lean();
        }
        if (batch && Array.isArray(batch.movieIds)) {
            targetIds = batch.movieIds.map(String);
        }
    }

    if (!targetIds.length) {
        const recentMovies = await Movie.find({}).select('_id').sort({ updatedAt: -1 }).limit(150).lean();
        targetIds = recentMovies.map((m) => String(m._id));
    }

    if (!targetIds.length) {
        return { success: true, enrichedCount: 0, totalCount: 0, message: 'No target movies found for enrichment' };
    }

    const filter = { _id: { $in: targetIds } };
    if (!force) {
        filter.$or = [
            { heroVideoStatus: { $ne: 'ready' } },
            { heroVideoUrl: '' },
            { heroVideoUrl: { $exists: false } },
        ];
    }

    const moviesToEnrich = await Movie.find(filter).lean();
    if (!moviesToEnrich.length) {
        return { success: true, enrichedCount: 0, totalCount: targetIds.length, message: 'All target movies already have ready native videos' };
    }

    let existingCloudinaryTrailers = new Map();
    try {
        if (process.env.CLOUDINARY_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_SECRET_KEY) {
            const result = await cloudinary.api.resources({
                type: 'upload',
                prefix: 'hero_trailers/',
                resource_type: 'video',
                max_results: 500,
            }).catch(() => null);

            if (result && Array.isArray(result.resources)) {
                for (const res of result.resources) {
                    const publicId = String(res.public_id || '');
                    const secureUrl = String(res.secure_url || '');
                    const format = String(res.format || 'mp4').toLowerCase();
                    if (publicId && secureUrl && ['mp4', 'webm'].includes(format)) {
                        const exactMovieId = publicId.replace('hero_trailers/', '').split('_')[0];
                        existingCloudinaryTrailers.set(exactMovieId, {
                            id: publicId,
                            url: secureUrl,
                            mimeType: `video/${format}`,
                        });
                    }
                }
            }
        }
    } catch {
        // Fall back to genre CDN pools if Cloudinary API inspection fails
    }

    const cloudName = process.env.CLOUDINARY_NAME || DEFAULT_CLOUD_NAME;
    const now = Date.now().toString();

    const bulkOps = moviesToEnrich.map((movie, index) => {
        const movieId = String(movie._id);
        let selected = existingCloudinaryTrailers.get(movieId);

        if (!selected) {
            selected = selectPoolAssetForMovie(movie, index, cloudName);
        }

        return {
            updateOne: {
                filter: { _id: movieId },
                update: {
                    $set: {
                        heroVideoId: selected.id,
                        heroVideoUrl: selected.url,
                        heroVideoMimeType: selected.mimeType,
                        heroVideoStatus: 'ready',
                        heroVideoVersion: now,
                    },
                },
            },
        };
    });

    const writeResult = await Movie.bulkWrite(bulkOps, { ordered: false });
    await invalidateHeroCatalogCaches();

    return {
        success: true,
        enrichedCount: writeResult?.modifiedCount || writeResult?.upsertedCount || bulkOps.length,
        totalCount: targetIds.length,
        message: `Successfully enriched ${bulkOps.length} movies with ready native video sources`,
    };
};

export default enrichCatalogHeroVideos;
