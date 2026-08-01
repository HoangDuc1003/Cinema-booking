import assert from 'node:assert/strict';
import test from 'node:test';
import { functions } from '../inngest/index.js';

test('catalog refresh and slot rotation jobs are registered with production schedules', () => {
    const byId = new Map(functions.map((fn) => [fn.opts?.id, fn]));
    assert.equal(byId.get('weekly-catalog-refresh')?.opts?.cron, 'TZ=Asia/Ho_Chi_Minh 0 3 * * 1');
    assert.equal(byId.get('rotate-active-catalog-slot')?.opts?.cron, 'TZ=Asia/Ho_Chi_Minh 0 8,20 * * *');
    assert.ok(byId.get('weekly-catalog-refresh'));
    assert.ok(byId.get('rotate-active-catalog-slot'));
});
