import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReservationConflict } from '../services/bookingConflictService.js';

const requestedSeats = ['H1', 'H2'];

test('same user and same pending booking returns existing booking guidance', () => {
    const conflict = classifyReservationConflict({
        reservations: requestedSeats.map((seat) => ({
            seat,
            status: 'held',
            user: 'user-a',
            booking: 'booking-a',
        })),
        requestedSeats,
        userId: 'user-a',
        pendingBooking: {
            _id: 'booking-a',
            bookedSeats: requestedSeats,
            holdExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
        },
    });
    assert.equal(conflict.code, 'EXISTING_PENDING_BOOKING');
    assert.equal(conflict.bookingId, 'booking-a');
    assert.equal(conflict.holdExpiresAt.toISOString(), '2030-01-01T00:00:00.000Z');
});

test('another user hold returns customer conflict', () => {
    const conflict = classifyReservationConflict({
        reservations: [{ seat: 'H1', status: 'held', user: 'user-b', booking: 'booking-b' }],
        requestedSeats,
        userId: 'user-a',
        pendingBooking: null,
    });
    assert.equal(conflict.code, 'SEATS_HELD_BY_ANOTHER_CUSTOMER');
});

test('confirmed seat returns unavailable conflict', () => {
    const conflict = classifyReservationConflict({
        reservations: [{ seat: 'H1', status: 'confirmed', user: 'user-b', booking: 'booking-b' }],
        requestedSeats,
        userId: 'user-a',
        pendingBooking: null,
    });
    assert.equal(conflict.code, 'SEAT_UNAVAILABLE');
});
