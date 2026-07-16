import { cloudinary } from '../configs/cloudinary.js';
import Movie from '../models/Movie.js';
import { deleteByPattern, deleteKeys } from './cacheService.js';
import { redisKeys } from './redisKeys.js';

export const getUploadSignature = async (movieId) => {
    const timestamp = Math.round((new Date()).getTime() / 1000);
    const signature = cloudinary.utils.api_sign_request(
        {
            timestamp: timestamp,
            folder: 'hero_trailers',
        },
        process.env.CLOUDINARY_SECRET_KEY
    );

    return {
        timestamp,
        signature,
        cloudName: process.env.CLOUDINARY_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        folder: 'hero_trailers',
    };
};

const invalidateHeroCatalogCaches = async () => {
    await deleteKeys(redisKeys.homeHero(), redisKeys.catalogLastGood());
    await deleteByPattern(redisKeys.homeHeroPattern());
    await deleteByPattern(redisKeys.catalogSlotPattern());
};

const verifyUploadedHeroVideo = async (publicId) => {
    const id = String(publicId || '').trim();
    if (!id.startsWith('hero_trailers/') || id.length > 240 || id.includes('..')) {
        throw new Error('Invalid Hero video asset ID');
    }
    const asset = await cloudinary.api.resource(id, { resource_type: 'video' });
    const format = String(asset?.format || '').toLowerCase();
    const secureUrl = String(asset?.secure_url || '');
    if (asset?.public_id !== id || asset?.resource_type !== 'video' || !['mp4', 'webm'].includes(format)) {
        throw new Error('Uploaded Hero asset is not a supported native video');
    }
    const parsedUrl = new URL(secureUrl);
    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'res.cloudinary.com') {
        throw new Error('Uploaded Hero asset is not hosted by the trusted CDN');
    }
    return { publicId: id, url: secureUrl, mimeType: `video/${format}` };
};

export const commitHeroVideo = async (movieId, { publicId }) => {
    const movie = await Movie.findById(movieId);
    if (!movie) throw new Error('Movie not found');
    const verified = await verifyUploadedHeroVideo(publicId);

    movie.heroVideoId = verified.publicId;
    movie.heroVideoUrl = verified.url;
    movie.heroVideoMimeType = verified.mimeType;
    movie.heroVideoStatus = 'ready';
    movie.heroVideoVersion = Date.now().toString();
    await movie.save();

    await invalidateHeroCatalogCaches();
    return movie;
};

export const removeHeroVideo = async (movieId) => {
    const movie = await Movie.findById(movieId);
    if (!movie) throw new Error('Movie not found');

    if (movie.heroVideoId) {
        try {
            await cloudinary.uploader.destroy(movie.heroVideoId, { resource_type: 'video' });
        } catch (error) {
            console.warn(`[Cloudinary] Failed to delete video ${movie.heroVideoId}:`, error.message);
        }
    }

    movie.heroVideoId = '';
    movie.heroVideoUrl = '';
    movie.heroVideoMimeType = '';
    movie.heroVideoStatus = '';
    movie.heroVideoVersion = Date.now().toString();
    await movie.save();

    await invalidateHeroCatalogCaches();
    return movie;
};

export const reconcileHeroAssets = async () => {
    let nextCursor = null;
    let deletedCount = 0;
    
    // 1. Get all movies with a native video
    const movies = await Movie.find({ heroVideoId: { $ne: '' } }).select('heroVideoId').lean();
    const validIds = new Set(movies.map(m => m.heroVideoId));

    // 2. Fetch all resources in Cloudinary folder
    do {
        const result = await cloudinary.api.resources({
            type: 'upload',
            prefix: 'hero_trailers/',
            resource_type: 'video',
            max_results: 500,
            next_cursor: nextCursor,
        });

        const resources = result.resources || [];
        const orphans = resources.filter(res => !validIds.has(res.public_id)).map(res => res.public_id);

        if (orphans.length > 0) {
            await cloudinary.api.delete_resources(orphans, { resource_type: 'video' });
            deletedCount += orphans.length;
            console.log(`[Reconcile] Deleted ${orphans.length} orphan videos from Cloudinary.`);
        }

        nextCursor = result.next_cursor;
    } while (nextCursor);

    return { success: true, deletedCount };
};
