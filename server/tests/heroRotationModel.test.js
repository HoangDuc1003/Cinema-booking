import test from 'node:test';
import assert from 'node:assert/strict';
import HeroRotationBatch from '../models/HeroRotationBatch.js';
import SiteConfig from '../models/SiteConfig.js';

const categoryIds = {
    newestMovieIds: Array.from({ length: 5 }, (_, index) => `new-${index}`),
    hotMovieIds: Array.from({ length: 5 }, (_, index) => `hot-${index}`),
    discoveryMovieIds: Array.from({ length: 5 }, (_, index) => `discovery-${index}`),
};

const activeBatch = (overrides = {}) => ({
    batchKey: 'hero-2026-07-29',
    version: 1,
    runId: 'cron:hero-2026-07-29',
    fencingToken: 1,
    status: 'active',
    generatedAt: new Date('2026-07-29T00:00:00+07:00'),
    activatedAt: new Date('2026-07-29T00:00:00+07:00'),
    nextRefreshAt: new Date('2026-07-31T00:00:00+07:00'),
    timezone: 'Asia/Ho_Chi_Minh',
    selectionSeed: 'seed-1',
    ...categoryIds,
    movieIds: Object.values(categoryIds).flat(),
    activeHeroMovieIds: [
        categoryIds.newestMovieIds[0],
        categoryIds.hotMovieIds[0],
        categoryIds.discoveryMovieIds[0],
        categoryIds.newestMovieIds[1],
        categoryIds.hotMovieIds[1],
    ],
    ...overrides,
});

test('HeroRotationBatch accepts exact 5/5/5 pool and five-category-covering active selection', () => {
    const batch = new HeroRotationBatch(activeBatch());
    assert.equal(batch.validateSync(), undefined);
});

test('HeroRotationBatch rejects category overlap and missing active category coverage', () => {
    const overlap = new HeroRotationBatch(activeBatch({
        discoveryMovieIds: [
            categoryIds.newestMovieIds[0],
            ...categoryIds.discoveryMovieIds.slice(1),
        ],
    }));
    assert.ok(overlap.validateSync()?.errors.movieIds);

    const noDiscovery = new HeroRotationBatch(activeBatch({
        activeHeroMovieIds: [
            ...categoryIds.newestMovieIds.slice(0, 3),
            ...categoryIds.hotMovieIds.slice(0, 2),
        ],
    }));
    assert.ok(noDiscovery.validateSync()?.errors.activeHeroMovieIds);
});

test('failed/building Hero batches can remain incomplete without weakening active invariants', () => {
    const failed = new HeroRotationBatch({
        batchKey: 'hero-failed',
        version: 2,
        runId: 'run-failed',
        fencingToken: 2,
        status: 'failed',
        generatedAt: new Date(),
        timezone: 'Asia/Ho_Chi_Minh',
        selectionSeed: 'failed-seed',
        failureReason: 'HERO_NATIVE_ASSETS_INSUFFICIENT',
    });
    assert.equal(failed.validateSync(), undefined);
});

test('HeroRotationBatch declares unique batch/run and partial single-active indexes', () => {
    const indexes = HeroRotationBatch.schema.indexes();
    assert.ok(indexes.some(([fields, options]) => (
        fields.batchKey === 1 && options.unique && options.name === 'hero_batch_key_unique'
    )));
    assert.ok(indexes.some(([fields, options]) => (
        fields.runId === 1 && options.unique && options.sparse && options.name === 'hero_run_unique'
    )));
    assert.ok(indexes.some(([fields, options]) => (
        fields.status === 1
        && options.unique
        && options.partialFilterExpression?.status === 'active'
    )));
});

test('SiteConfig persists the non-negative integer Hero cache generation', () => {
    const config = new SiteConfig({ key: 'heroRotation' });
    assert.equal(config.heroRotation.cacheGeneration, 0);
    config.heroRotation.cacheGeneration = 1.5;
    assert.ok(config.validateSync()?.errors['heroRotation.cacheGeneration']);
});
