import assert from 'node:assert/strict';
import test from 'node:test';
import { functions } from '../inngest/index.js';

test('catalog refresh and slot rotation jobs are registered with production schedules', () => {
    const byId = new Map(functions.map((fn) => [fn.opts?.id, fn]));
    assert.equal(byId.get('weekly-catalog-refresh')?.opts?.cron, 'TZ=Asia/Ho_Chi_Minh 0 3 * * 1');
    assert.equal(byId.get('rotate-active-catalog-slot')?.opts?.cron, 'TZ=Asia/Ho_Chi_Minh 0 8,20 * * *');
    assert.equal(byId.get('sync-vn-now-playing-shows')?.opts?.cron, 'TZ=Asia/Ho_Chi_Minh 5 0 * * *');
    assert.ok(byId.get('weekly-catalog-refresh'));
    assert.ok(byId.get('rotate-active-catalog-slot'));
    assert.ok(byId.get('sync-vn-now-playing-shows'));
    // The Hero is poster-only: no native-video ingestion or rotation jobs remain.
    for (const removed of [
        'hero-media-requested',
        'hero-media-ingest',
        'hero-media-verify',
        'hero-pool-reconcile',
        'enrich-catalog-hero-videos',
        'daily-native-hero-rotation-refresh',
        'reconcile-hero-assets',
    ]) {
        assert.equal(byId.has(removed), false, `${removed} should no longer be registered`);
    }
});
