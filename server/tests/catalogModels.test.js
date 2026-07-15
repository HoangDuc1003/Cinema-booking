import test from 'node:test';
import assert from 'node:assert/strict';
import CatalogBatch from '../models/CatalogBatch.js';
import SiteConfig from '../models/SiteConfig.js';

test('CatalogBatch validation rejects invalid status values', () => {
    const batch = new CatalogBatch({
        weekKey: '2026-W28',
        status: 'invalid_status',
    });
    const err = batch.validateSync();
    assert.ok(err);
    assert.ok(err.errors['status']);
});

test('CatalogBatch validation rejects bucket with non-50 items when staging', () => {
    const batch = new CatalogBatch({
        weekKey: '2026-W28',
        status: 'staging',
        buckets: {
            newest: Array(49).fill('movie-1'), // 49 instead of 50
            classics: Array(50).fill('movie-2'),
            popular: Array(50).fill('movie-3')
        },
        movieIds: Array(150).fill('movie')
    });
    const err = batch.validateSync();
    assert.ok(err);
    assert.ok(err.errors['buckets.newest']);
});

test('CatalogBatch validation rejects duplicate movie IDs in buckets', () => {
    // Array of 50, but contains duplicates (all 'movie-1')
    const newest = Array(50).fill('movie-1');
    const batch = new CatalogBatch({
        weekKey: '2026-W28',
        status: 'staging',
        buckets: {
            newest,
            classics: Array(50).fill().map((_, i) => `classic-${i}`),
            popular: Array(50).fill().map((_, i) => `popular-${i}`)
        },
        movieIds: Array(150).fill().map((_, i) => `movie-${i}`)
    });
    const err = batch.validateSync();
    assert.ok(err);
    assert.ok(err.errors['buckets.newest']);
});

test('CatalogBatch validation accepts exactly 50 unique movie IDs in buckets and 150 globally unique movieIds', () => {
    const newest = Array(50).fill().map((_, i) => `newest-${i}`);
    const classics = Array(50).fill().map((_, i) => `classics-${i}`);
    const popular = Array(50).fill().map((_, i) => `popular-${i}`);
    const movieIds = [...newest, ...classics, ...popular];

    const batch = new CatalogBatch({
        weekKey: '2026-W28',
        status: 'staging',
        buckets: { newest, classics, popular },
        movieIds,
        generatedAt: new Date(),
        sourceMeta: {
            region: 'US',
            language: 'en',
            newestPages: [1],
            classicPages: [1, 2],
            popularPages: [1]
        },
        metrics: {
            fetched: 200,
            rejected: 10,
            duplicates: 40,
            detailsFetched: 150
        }
    });

    const err = batch.validateSync();
    assert.equal(err, undefined);
});

test('CatalogBatch validation skips bucket and movieIds length checks if status is failed', () => {
    const batch = new CatalogBatch({
        weekKey: '2026-W28',
        status: 'failed',
        buckets: {
            newest: ['only-one'],
            classics: [],
            popular: []
        },
        movieIds: [],
        failureReason: 'TMDB API timeout'
    });
    const err = batch.validateSync();
    assert.equal(err, undefined);
});

test('SiteConfig has catalog schema fields', () => {
    const schema = SiteConfig.schema;
    assert.ok(schema.path('catalog.activeBatchId'));
    assert.ok(schema.path('catalog.refreshing'));
    assert.ok(schema.path('catalog.activeSlot'));
    assert.ok(schema.path('catalog.lastRotationAt'));
    assert.ok(schema.path('catalog.lastSuccessfulRefreshAt'));
});
