import test from 'node:test';
import assert from 'node:assert/strict';
import Movie from '../models/Movie.js';
import SiteConfig from '../models/SiteConfig.js';
import CatalogBatch from '../models/CatalogBatch.js';
import { getPublicHomeHero } from '../services/heroService.js';

test('manual Hero remains authoritative and preserves the stored movie order', async () => {
    const originalConfig = SiteConfig.findOneAndUpdate;
    const originalFind = Movie.find;
    const movies = [
        { _id: '2', title: 'Second', poster_path: '/2.jpg', heroVideoStatus: 'ready', heroVideoUrl: 'https://cdn.test/2.mp4', heroVideoMimeType: 'video/mp4' },
        { _id: '1', title: 'First', poster_path: '/1.jpg', heroVideoStatus: 'ready', heroVideoUrl: 'https://cdn.test/1.mp4', heroVideoMimeType: 'video/mp4' },
    ];
    SiteConfig.findOneAndUpdate = () => ({
        lean: async () => ({ homeHero: { mode: 'manual', movieIds: ['2', '1'] }, updatedAt: new Date() }),
    });
    Movie.find = () => ({
        select: () => ({ lean: async () => movies }),
    });
    try {
        const payload = await getPublicHomeHero();
        assert.equal(payload.settings.effectiveMode, 'manual');
        assert.deepEqual(payload.movies.map((movie) => movie.id), ['2', '1']);
    } finally {
        SiteConfig.findOneAndUpdate = originalConfig;
        Movie.find = originalFind;
    }
});

test('getPublicHomeHero slices 5 movies according to heroOffset across 150 pre-downloaded pool', async () => {
    const originalConfigFindOneAndUpdate = SiteConfig.findOneAndUpdate;
    const originalConfigFindOne = SiteConfig.findOne;
    const originalBatchFindOne = CatalogBatch.findOne;
    const originalMovieFind = Movie.find;

    const all150Ids = Array.from({ length: 150 }, (_, i) => `movie-${i}`);
    const mockMovies = all150Ids.map((id) => ({
        _id: id,
        title: `Title ${id}`,
        poster_path: `/${id}.jpg`,
    }));

    SiteConfig.findOneAndUpdate = () => ({
        lean: async () => ({ homeHero: { mode: 'auto', movieIds: [] }, updatedAt: new Date() }),
    });
    SiteConfig.findOne = () => ({
        lean: async () => ({ catalog: { activeBatchId: 'batch-1' } }),
    });
    CatalogBatch.findById = () => ({
        lean: async () => ({ _id: 'batch-1', status: 'active', movieIds: all150Ids, weekKey: '2026-W28', version: 1 }),
    });
    CatalogBatch.findOne = () => ({
        lean: async () => ({ _id: 'batch-1', status: 'active', movieIds: all150Ids, weekKey: '2026-W28', version: 1 }),
    });
    Movie.find = (query) => {
        const ids = query?._id?.$in || [];
        return {
            select: () => ({
                lean: async () => mockMovies.filter((m) => ids.includes(m._id)),
            }),
            lean: async () => mockMovies.filter((m) => ids.includes(m._id)),
        };
    };

    try {
        const payload = await getPublicHomeHero({ heroOffset: 1 });
        assert.deepEqual(payload.movies.map((m) => m.id), ['movie-5', 'movie-6', 'movie-7', 'movie-8', 'movie-9']);
    } finally {
        SiteConfig.findOneAndUpdate = originalConfigFindOneAndUpdate;
        SiteConfig.findOne = originalConfigFindOne;
        CatalogBatch.findOne = originalBatchFindOne;
        Movie.find = originalMovieFind;
    }
});
