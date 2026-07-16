import test from 'node:test';
import assert from 'node:assert/strict';
import Movie from '../models/Movie.js';
import SiteConfig from '../models/SiteConfig.js';
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
