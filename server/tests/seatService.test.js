import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBookingAmount, normalizeSeats } from '../services/seatService.js';

test('normalizeSeats normalizes, sorts, and rejects duplicates', () => {
    assert.deepEqual(normalizeSeats(['j10', 'A2', 'c1']), ['A2', 'C1', 'J10']);
    assert.throws(() => normalizeSeats(['A1', 'a1']), /Duplicate seats/);
});

test('normalizeSeats enforces the real seat layout and booking limit', () => {
    assert.throws(() => normalizeSeats(['A10']), /Invalid seat/);
    assert.throws(() => normalizeSeats(['K1']), /Invalid seat/);
    assert.throws(
        () => normalizeSeats(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9']),
        /at most 8 seats/,
    );
});

test('calculateBookingAmount applies server-side seat multipliers', () => {
    assert.equal(calculateBookingAmount(10, ['A1', 'C1', 'H1']), 45);
    assert.equal(calculateBookingAmount(12.5, ['B2', 'J18']), 37.5);
});
