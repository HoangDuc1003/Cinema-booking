import mongoose from 'mongoose';
import Stripe from 'stripe';
import Booking from '../models/Booking.js';
import Show from '../models/Show.js';
import SeatReservation from '../models/SeatReservation.js';
import { getValue, setValue } from '../services/cacheService.js';
import { invalidateSeatAvailability } from '../services/cacheInvalidationService.js';
import { withDistributedLock, LockBusyError } from '../services/lockService.js';
import { releaseSeatHolds } from '../services/seatHoldService.js';
import { redisKeys, redisTtl } from '../services/redisKeys.js';
import connectDB from '../configs/db.js';
import ensureCriticalIndexes from '../configs/indexes.js';

const getCheckoutSession = async (stripe, event) => {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        return event.data.object;
    }
    if (event.type === 'payment_intent.succeeded') {
        const sessions = await stripe.checkout.sessions.list({ payment_intent: event.data.object.id, limit: 1 });
        return sessions.data[0] || null;
    }
    return null;
};

const parseBookingIds = (session) => {
    const metadata = session?.metadata || {};
    const rawIds = metadata.bookingIds ? metadata.bookingIds.split(',') : [metadata.bookingId];
    return [...new Set(rawIds.filter((id) => mongoose.isValidObjectId(id)))];
};

const confirmBookings = async (bookingIds) => {
    if (!bookingIds.length) return [];
    const mongoSession = await mongoose.startSession();
    const confirmed = [];

    try {
        await mongoSession.withTransaction(async () => {
            const bookings = await Booking.find({ _id: { $in: bookingIds } }).session(mongoSession);
            for (const booking of bookings) {
                if (booking.isPaid) continue;
                const show = await Show.findById(booking.show).session(mongoSession);
                if (!show) throw new Error(`Show missing for booking ${booking._id}`);

                const occupied = show.occupiedSeats || {};
                const conflictingSeat = booking.bookedSeats.find(
                    (seat) => occupied[seat] && occupied[seat] !== booking.user,
                );
                if (conflictingSeat) throw new Error(`Seat conflict while confirming ${conflictingSeat}`);

                for (const seat of booking.bookedSeats) {
                    await SeatReservation.findOneAndUpdate({
                        show: booking.show,
                        seat,
                        booking: booking._id,
                    }, {
                        $set: { status: 'confirmed', expiresAt: null, user: booking.user },
                        $setOnInsert: { show: booking.show, seat, booking: booking._id },
                    }, { upsert: true, new: true, session: mongoSession });
                }

                const setOccupied = Object.fromEntries(
                    booking.bookedSeats.map((seat) => [`occupiedSeats.${seat}`, booking.user]),
                );
                await Show.updateOne({ _id: booking.show }, { $set: setOccupied }, { session: mongoSession });
                await Booking.updateOne({ _id: booking._id, isPaid: false }, {
                    $set: { isPaid: true, status: 'paid', paymentLink: '' },
                }, { session: mongoSession });

                confirmed.push({
                    bookingId: String(booking._id),
                    showId: String(booking.show),
                    movieId: String(show.movie),
                    seats: booking.bookedSeats,
                });
            }
        });
    } finally {
        await mongoSession.endSession();
    }

    return confirmed;
};

export const stripeWebhooks = async (req, res) => {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
        console.error('[Stripe webhook] Stripe secrets are not configured');
        return res.status(503).json({ error: 'Stripe webhook is not configured.' });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    let event;
    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            req.headers['stripe-signature'],
            process.env.STRIPE_WEBHOOK_SECRET,
        );
    } catch (error) {
        return res.status(400).send(`Webhook error: ${error.message}`);
    }

    try {
        await connectDB();
        await ensureCriticalIndexes();
        const processedKey = redisKeys.paymentEvent(event.id);
        if (await getValue(processedKey)) {
            return res.status(200).json({ received: true, duplicate: true });
        }

        const confirmed = await withDistributedLock(
            redisKeys.paymentEventLock(event.id),
            { ttlMs: redisTtl.paymentLockMs, waitMs: 500, retryMs: 50 },
            async () => {
                if (await getValue(processedKey)) return [];
                const checkout = await getCheckoutSession(stripe, event);
                const changes = checkout ? await confirmBookings(parseBookingIds(checkout)) : [];
                await setValue(processedKey, 'processed', redisTtl.paymentIdempotency);
                return changes;
            },
        );

        await Promise.all(confirmed.flatMap((item) => [
            releaseSeatHolds({
                showId: item.showId,
                seats: item.seats,
                bookingId: item.bookingId,
            }),
            invalidateSeatAvailability({ showId: item.showId, movieId: item.movieId }),
        ]));

        return res.status(200).json({ received: true });
    } catch (error) {
        const status = error instanceof LockBusyError ? 409 : 500;
        console.error('[Stripe webhook] Processing failed:', error.message);
        return res.status(status).json({ error: 'Webhook processing failed.' });
    }
};
