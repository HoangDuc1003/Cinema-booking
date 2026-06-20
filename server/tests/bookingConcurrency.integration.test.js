import test from 'node:test';
import assert from 'node:assert/strict';

const enabled = process.env.ALLOW_INTEGRATION_TESTS === 'true' && Boolean(process.env.TEST_MONGODB_URI);

test('unique (show, seat) index permits exactly one concurrent winner', { skip: !enabled }, async () => {
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
    const [{ default: mongoose }, { default: Show }, { default: Booking }, { default: SeatReservation }] = await Promise.all([
        import('mongoose'),
        import('../models/Show.js'),
        import('../models/Booking.js'),
        import('../models/SeatReservation.js'),
    ]);

    await mongoose.connect(process.env.TEST_MONGODB_URI);
    await Promise.all([Show.init(), Booking.init(), SeatReservation.init()]);

    const suffix = `${Date.now()}-${Math.random()}`;
    const show = await Show.create({
        movie: `test-${suffix}`,
        showDateTime: new Date(Date.now() + 86400000),
        showPrice: 10,
        hall: `test-${suffix}`,
    });
    const expiresAt = new Date(Date.now() + 1800000);
    const bookings = await Booking.create([
        { user: `user-a-${suffix}`, show: show._id, amount: 10, bookedSeats: ['H1'], holdExpiresAt: expiresAt },
        { user: `user-b-${suffix}`, show: show._id, amount: 10, bookedSeats: ['H1'], holdExpiresAt: expiresAt },
    ]);

    try {
        const attempts = await Promise.allSettled(bookings.map((booking) => SeatReservation.create({
            show: show._id,
            seat: 'H1',
            booking: booking._id,
            user: booking.user,
            status: 'held',
            expiresAt,
        })));
        assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal(attempts.filter((result) => result.status === 'rejected' && result.reason?.code === 11000).length, 1);
    } finally {
        await SeatReservation.deleteMany({ show: show._id });
        await Booking.deleteMany({ show: show._id });
        await Show.deleteOne({ _id: show._id });
        await mongoose.disconnect();
    }
});
