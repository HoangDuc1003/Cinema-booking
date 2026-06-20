const sameSeatSet = (left = [], right = []) => {
    if (left.length !== right.length) return false;
    const rightSet = new Set(right.map(String));
    return left.every((seat) => rightSet.has(String(seat)));
};

export class BookingConflictError extends Error {
    constructor({ code, message, bookingId = null, holdExpiresAt = null }) {
        super(message);
        this.name = 'BookingConflictError';
        this.code = code;
        this.bookingId = bookingId;
        this.holdExpiresAt = holdExpiresAt;
        this.statusCode = 409;
    }
}

export const classifyReservationConflict = ({ reservations, requestedSeats, userId, pendingBooking }) => {
    if (!reservations?.length) return null;
    if (reservations.some((reservation) => reservation.status === 'confirmed')) {
        return {
            code: 'SEAT_UNAVAILABLE',
            message: 'One or more seats are no longer available.',
        };
    }

    const heldBySameUser = reservations.every(
        (reservation) => reservation.status === 'held' && String(reservation.user) === String(userId),
    );
    const oneBooking = new Set(reservations.map((reservation) => String(reservation.booking))).size === 1;
    if (
        heldBySameUser
        && oneBooking
        && pendingBooking
        && sameSeatSet(pendingBooking.bookedSeats, requestedSeats)
    ) {
        return {
            code: 'EXISTING_PENDING_BOOKING',
            bookingId: String(pendingBooking._id),
            holdExpiresAt: pendingBooking.holdExpiresAt || null,
            message: 'You already have an active pending booking for these seats. Please complete payment from My Bookings.',
        };
    }

    if (reservations.some((reservation) => String(reservation.user) !== String(userId))) {
        return {
            code: 'SEATS_HELD_BY_ANOTHER_CUSTOMER',
            message: 'One or more seats were just held by another customer. Please choose again.',
        };
    }

    return {
        code: 'SEAT_UNAVAILABLE',
        message: 'One or more seats are no longer available.',
    };
};
