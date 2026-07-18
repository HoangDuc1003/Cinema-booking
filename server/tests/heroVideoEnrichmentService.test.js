import test from 'node:test';
import assert from 'node:assert/strict';
import Movie from '../models/Movie.js';
import CatalogBatch from '../models/CatalogBatch.js';
import { getGenreCinematicVideoPool, enrichCatalogHeroVideos } from '../services/heroVideoEnrichmentService.js';
import * as cacheService from '../services/cacheService.js';

test('getGenreCinematicVideoPool maps genres correctly to Cloudinary CDN pools', () => {
    const actionPool = getGenreCinematicVideoPool(['Action', 'Adventure'], 'testcloud');
    assert.ok(actionPool.length > 0);
    assert.ok(actionPool[0].url.includes('/testcloud/'));
    assert.equal(actionPool[0].mimeType, 'video/mp4');

    const dramaPool = getGenreCinematicVideoPool([{ id: 18, name: 'Drama' }], 'demo');
    assert.ok(dramaPool[0].url.includes('/demo/'));
    assert.ok(dramaPool[0].id.includes('drama') || dramaPool[0].id.includes('romance'));
});

test('enrichCatalogHeroVideos assigns ready native video URLs for target movies', async () => {
    const originalFind = Movie.find;
    const originalBulkWrite = Movie.bulkWrite;
    const originalBatchFindById = CatalogBatch.findById;
    const originalBatchFindOne = CatalogBatch.findOne;
    const originalDeleteKeys = cacheService.deleteKeys;
    const originalDeleteByPattern = cacheService.deleteByPattern;

    const mockMovies = [
        { _id: '101', title: 'Action Movie', genres: ['Action'] },
        { _id: '102', title: 'Drama Movie', genres: ['Drama'] },
    ];

    let bulkOpsReceived = null;

    CatalogBatch.findById = () => ({
        lean: async () => null,
    });
    CatalogBatch.findOne = () => ({
        lean: async () => ({ _id: 'batch-1', status: 'active', movieIds: ['101', '102'] }),
    });
    Movie.find = () => ({
        lean: async () => mockMovies,
    });
    Movie.bulkWrite = async (ops) => {
        bulkOpsReceived = ops;
        return { modifiedCount: ops.length };
    };

    try {
        const result = await enrichCatalogHeroVideos();
        assert.equal(result.success, true);
        assert.equal(result.enrichedCount, 2);
        assert.ok(bulkOpsReceived !== null);
        assert.equal(bulkOpsReceived.length, 2);
        assert.equal(bulkOpsReceived[0].updateOne.filter._id, '101');
        assert.equal(bulkOpsReceived[0].updateOne.update.$set.heroVideoStatus, 'ready');
        assert.ok(bulkOpsReceived[0].updateOne.update.$set.heroVideoUrl.startsWith('https://res.cloudinary.com/'));
    } finally {
        Movie.find = originalFind;
        Movie.bulkWrite = originalBulkWrite;
        CatalogBatch.findById = originalBatchFindById;
        CatalogBatch.findOne = originalBatchFindOne;
    }
});
