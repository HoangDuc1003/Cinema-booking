import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SHOWTIME_TIME_ZONE,
    getShowtimeDateKey,
    groupPersistedShowtimes,
    parseCinemaShowDateTime,
} from '../services/showtimeService.js';

test('admin show input is interpreted in the Vietnam cinema timezone', () => {
    assert.equal(SHOWTIME_TIME_ZONE, 'Asia/Ho_Chi_Minh');
    assert.equal(parseCinemaShowDateTime('2026-07-26', '10:00').toISOString(), '2026-07-26T03:00:00.000Z');
    assert.throws(() => parseCinemaShowDateTime('26/07/2026', '10:00'), RangeError);
    assert.throws(() => parseCinemaShowDateTime('2026-07-26', '25:00'), RangeError);
});

test('persisted shows are sorted and grouped by their Vietnam calendar date', () => {
    const dateTime = groupPersistedShowtimes([
        {
            _id: '66b000000000000000000002',
            showDateTime: '2026-07-26T06:30:00.000Z',
            showPrice: 75,
            hall: 'Hall B',
        },
        {
            _id: '66b000000000000000000001',
            showDateTime: '2026-07-25T17:30:00.000Z',
            showPrice: 50,
            hall: 'Hall A',
        },
    ]);

    assert.equal(getShowtimeDateKey('2026-07-25T17:30:00.000Z'), '2026-07-26');
    assert.deepEqual(Object.keys(dateTime), ['2026-07-26']);
    assert.deepEqual(dateTime['2026-07-26'], [
        {
            showId: '66b000000000000000000001',
            time: '2026-07-25T17:30:00.000Z',
            price: 50,
            hall: 'Hall A',
            isVirtual: false,
        },
        {
            showId: '66b000000000000000000002',
            time: '2026-07-26T06:30:00.000Z',
            price: 75,
            hall: 'Hall B',
            isVirtual: false,
        },
    ]);
});

