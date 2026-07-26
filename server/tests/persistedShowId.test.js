import test from 'node:test';
import assert from 'node:assert/strict';
import { isPersistedShowId } from '../controllers/bookingController.js';

test('booking accepts only persisted Mongo show IDs', () => {
    assert.equal(isPersistedShowId('66b000000000000000000001'), true);
    assert.equal(isPersistedShowId('mock_123_2026-07-26_10:00'), false);
    assert.equal(isPersistedShowId('virtual_123_1785034800000'), false);
    assert.equal(isPersistedShowId(''), false);
});
