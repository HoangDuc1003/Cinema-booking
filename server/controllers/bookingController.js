import axios from 'axios';
import mongoose from 'mongoose';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import Booking from '../models/Booking.js';
import SeatReservation from '../models/SeatReservation.js';
import { rememberJson } from '../services/cacheService.js';
import { invalidateSeatAvailability } from '../services/cacheInvalidationService.js';
import { withDistributedLock, LockBusyError } from '../services/lockService.js';
import { createSeatHolds, releaseSeatHolds } from '../services/seatHoldService.js';
import { calculateBookingAmount, isMongoDuplicateKey, normalizeSeats } from '../services/seatService.js';
import { redisKeys, redisTtl } from '../services/redisKeys.js';
import ensureCriticalIndexes from '../configs/indexes.js';
import { getClientOrigin } from '../configs/runtimeConfig.js';
import {
    buildPaymentRetryPayload,
    createBatchCheckoutSession,
    createBookingCheckoutSession,
    getPaymentErrorCode,
    getPaymentErrorStatus,
    getSafeStripeError,
} from '../services/stripeService.js';
import {
    BookingConflictError,
    classifyReservationConflict,
} from '../services/bookingConflictService.js';

const ensureMovieExists = async (movieId) => {
    const id = String(movieId);
    const existing = await Movie.findById(id);
    if (existing) return existing;

    const [details, credits] = await Promise.all([
        axios.get(`https://api.themoviedb.org/3/movie/${id}`, {
            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
        }),
        axios.get(`https://api.themoviedb.org/3/movie/${id}/credits`, {
            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
        }),
    ]);

    return Movie.findOneAndUpdate({ _id: id }, {
        $setOnInsert: {
            _id: id,
            title: details.data.title,
            overview: details.data.overview,
            poster_path: details.data.poster_path,
            backdrop_path: details.data.backdrop_path,
            genres: details.data.genres,
            casts: credits.data.cast,
            release_date: details.data.release_date,
            vote_average: details.data.vote_average,
            runtime: details.data.runtime,
            tagline: details.data.tagline || '',
            original_language: details.data.original_language,
        },
    }, { new: true, upsert: true });
};

const parseVirtualShow = (payload) => {
    const { showId } = payload;
    if (showId.startsWith('virtual_')) {
        const parts = showId.split('_');
        return {
            movieId: String(parts[1]),
            showDateTime: new Date(Number(parts[2])),
            hall: 'Virtual Hall',
            showPrice: 50,
        };
    }
    if (showId.startsWith('mock_')) {
        return {
            movieId: String(payload.movieId),
            showDateTime: new Date(payload.showDateTime),
            hall: String(payload.hall || 'NitroCine Premium'),
            showPrice: Number(payload.price) || 50,
        };
    }
    return null;
};

const resolveShow = async (payload) => {
    const virtual = parseVirtualShow(payload);
    if (!virtual) {
        if (!mongoose.isValidObjectId(payload.showId)) return null;
        return Show.findById(payload.showId);
    }
    if (!virtual.movieId || Number.isNaN(virtual.showDateTime.getTime())) return null;

    await ensureMovieExists(virtual.movieId);
    try {
        return await Show.findOneAndUpdate({
            movie: virtual.movieId,
            showDateTime: virtual.showDateTime,
            hall: virtual.hall,
        }, {
            $setOnInsert: { showPrice: virtual.showPrice, occupiedSeats: {} },
        }, { new: true, upsert: true, setDefaultsOnInsert: true });
    } catch (error) {
        if (!isMongoDuplicateKey(error)) throw error;
        return Show.findOne({
            movie: virtual.movieId,
            showDateTime: virtual.showDateTime,
            hall: virtual.hall,
        });
    }
};

const findShowForSeatMap = async (showId) => {
    if (showId.startsWith('virtual_')) {
        const parsed = parseVirtualShow({ showId });
        if (!parsed || Number.isNaN(parsed.showDateTime.getTime())) return null;
        return Show.findOne({
            movie: parsed.movieId,
            showDateTime: parsed.showDateTime,
            hall: parsed.hall,
        }).lean();
    }
    if (showId.startsWith('mock_') || !mongoose.isValidObjectId(showId)) return null;
    return Show.findById(showId).lean();
};

const logStripeSessionFailure = ({ label, error, booking, bookings, amount, origin }) => {
    console.error(label, {
        bookingId: booking?._id && String(booking._id),
        bookingIds: bookings?.map((item) => String(item._id)),
        amount: amount ?? booking?.amount,
        hasStripeSecret: Boolean(process.env.STRIPE_SECRET_KEY),
        hasClientUrl: Boolean(process.env.CLIENT_URL),
        origin,
        stripeError: getSafeStripeError(error),
    });
};

const formatHoldExpiry = (value) => {
    const date = value && new Date(value);
    return date && !Number.isNaN(date.getTime()) ? date.toISOString() : 'the current hold expires';
};

const getPaymentFailureMessage = ({ error, holdExpiresAt, create = false }) => {
    const status = getPaymentErrorStatus(error);
    if (status === 503) {
        return create
            ? 'Seats are held, but payment is not configured on the server. Retry payment from My Bookings before the hold expires.'
            : `Payment is temporarily unavailable because the server configuration is incomplete. Your seats are still held until ${formatHoldExpiry(holdExpiresAt)}.`;
    }
    if (status === 400) {
        return create
            ? 'Seats are held, but the booking amount is invalid. Please retry from My Bookings or contact support.'
            : `The booking amount is invalid. Your seats are still held until ${formatHoldExpiry(holdExpiresAt)}.`;
    }
    return create
        ? 'Seats are held, but the payment link could not be created. Retry payment from My Bookings before the hold expires.'
        : `Payment provider is temporarily unavailable. Your seats are still held until ${formatHoldExpiry(holdExpiresAt)}.`;
};

const invalidateBookingCaches = async (show, alias = null) => invalidateSeatAvailability({
    showId: String(show._id),
    movieId: String(show.movie?._id || show.movie),
    aliases: alias ? [alias] : [],
});

const findActiveBookingConflict = async ({ showId, seats, userId, session = null }) => {
    const now = new Date();
    let reservationQuery = SeatReservation.find({
        show: showId,
        seat: { $in: seats },
        $or: [
            { status: 'confirmed' },
            { status: 'held', expiresAt: { $gt: now } },
        ],
    });
    if (session) reservationQuery = reservationQuery.session(session);
    const reservations = await reservationQuery.lean();
    if (!reservations.length) return null;

    const bookingIds = [...new Set(reservations.map((item) => String(item.booking)))];
    let pendingBooking = null;
    if (bookingIds.length === 1) {
        let bookingQuery = Booking.findOne({
            _id: bookingIds[0],
            user: userId,
            isPaid: false,
            status: 'pending',
            holdExpiresAt: { $gt: now },
        });
        if (session) bookingQuery = bookingQuery.session(session);
        pendingBooking = await bookingQuery.lean();
    }

    return classifyReservationConflict({ reservations, requestedSeats: seats, userId, pendingBooking });
};

const sendBookingConflict = (res, error) => {
    const existing = error.code === 'EXISTING_PENDING_BOOKING';
    return res.status(409).json({
        success: false,
        code: error.code,
        message: error.message,
        existingBookingId: error.bookingId || undefined,
        holdExpiresAt: error.holdExpiresAt || undefined,
        retryPayment: existing,
        retryEndpoint: existing ? '/api/booking/pay-now' : undefined,
    });
};

const extendActiveHold = async (booking) => {
    // Legacy bookings created before SeatReservation rollout have no hold expiry.
    if (!booking.holdExpiresAt) return booking;
    const showId = booking.show?._id || booking.show;
    const nextExpiry = new Date(Date.now() + (redisTtl.seatHold * 1000));

    await withDistributedLock(
        redisKeys.bookingLock(showId),
        { ttlMs: redisTtl.bookingLockMs, waitMs: 1000, retryMs: 75 },
        async () => {
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    const reservations = await SeatReservation.updateMany({
                        booking: booking._id,
                        status: 'held',
                        expiresAt: { $gt: new Date() },
                    }, { $set: { expiresAt: nextExpiry } }, { session });
                    if (reservations.matchedCount !== booking.bookedSeats.length) {
                        throw Object.assign(new Error('The seat hold expired. Please book again.'), { statusCode: 410 });
                    }
                    await Booking.updateOne({ _id: booking._id, isPaid: false }, {
                        $set: { holdExpiresAt: nextExpiry, status: 'pending' },
                    }, { session });
                });
            } finally {
                await session.endSession();
            }
        },
    );

    booking.holdExpiresAt = nextExpiry;
    await createSeatHolds({ showId, seats: booking.bookedSeats, bookingId: booking._id });
    if (booking.show?._id) await invalidateBookingCaches(booking.show);
    return booking;
};

export const createBooking = async (req, res) => {
    let userId;
    let showId = '';
    let seats = [];
    let resolvedShow = null;
    try {
        await ensureCriticalIndexes();
        ({ userId } = req.auth());
        showId = String(req.body.showId || '');
        seats = normalizeSeats(req.body.selectedSeats);
        const show = await resolveShow({ ...req.body, showId });
        if (!show) return res.status(404).json({ success: false, message: 'Show not found.' });
        resolvedShow = show;

        const result = await withDistributedLock(
            redisKeys.bookingLock(show._id),
            { ttlMs: redisTtl.bookingLockMs, waitMs: 1500, retryMs: 75 },
            async () => {
                const session = await mongoose.startSession();
                let booking;
                try {
                    await session.withTransaction(async () => {
                        const currentShow = await Show.findById(show._id).session(session);
                        if (!currentShow) throw Object.assign(new Error('Show not found.'), { statusCode: 404 });

                        const legacyOccupied = new Set(Object.keys(currentShow.occupiedSeats || {}));
                        if (seats.some((seat) => legacyOccupied.has(seat))) {
                            throw Object.assign(new Error('One or more seats are no longer available.'), { statusCode: 409 });
                        }

                        const now = new Date();
                        const expired = await SeatReservation.find({
                            show: currentShow._id,
                            seat: { $in: seats },
                            status: 'held',
                            expiresAt: { $lte: now },
                        }).select('booking').session(session).lean();
                        if (expired.length) {
                            const expiredBookingIds = [...new Set(expired.map((item) => String(item.booking)))];
                            await SeatReservation.deleteMany({
                                show: currentShow._id,
                                seat: { $in: seats },
                                status: 'held',
                                expiresAt: { $lte: now },
                            }).session(session);
                            await Booking.updateMany(
                                { _id: { $in: expiredBookingIds }, isPaid: false },
                                { $set: { status: 'expired', paymentLink: '' } },
                            ).session(session);
                        }

                        const conflict = await findActiveBookingConflict({
                            showId: currentShow._id,
                            seats,
                            userId,
                            session,
                        });
                        if (conflict) throw new BookingConflictError(conflict);

                        const holdExpiresAt = new Date(Date.now() + (redisTtl.seatHold * 1000));
                        const amount = calculateBookingAmount(currentShow.showPrice, seats);
                        [booking] = await Booking.create([{
                            user: userId,
                            show: currentShow._id,
                            amount,
                            bookedSeats: seats,
                            holdExpiresAt,
                        }], { session });

                        await SeatReservation.insertMany(seats.map((seat) => ({
                            show: currentShow._id,
                            seat,
                            booking: booking._id,
                            user: userId,
                            status: 'held',
                            expiresAt: holdExpiresAt,
                        })), { session, ordered: true });
                    });
                } finally {
                    await session.endSession();
                }

                await createSeatHolds({ showId: show._id, seats, bookingId: booking._id });
                await invalidateBookingCaches(show, showId);
                return booking;
            },
        );

        let origin;
        try {
            const movie = await Movie.findById(show.movie).select('title').lean();
            origin = getClientOrigin(req);
            const checkout = await createBookingCheckoutSession({
                booking: result,
                movieTitle: movie?.title,
                origin,
                userId,
            });
            await Booking.updateOne({ _id: result._id, isPaid: false }, { paymentLink: checkout.url });
            return res.status(201).json({
                success: true,
                bookingId: result._id,
                holdExpiresAt: result.holdExpiresAt,
                url: checkout.url,
                message: 'Seats held. Complete payment before the hold expires.',
            });
        } catch (stripeError) {
            logStripeSessionFailure({
                label: '[Stripe session failed]',
                error: stripeError,
                booking: result,
                origin,
            });
            const status = getPaymentErrorStatus(stripeError);
            return res.status(status).json(buildPaymentRetryPayload({
                booking: result,
                error: stripeError,
                message: getPaymentFailureMessage({
                    error: stripeError,
                    holdExpiresAt: result.holdExpiresAt,
                    create: true,
                }),
            }));
        }
    } catch (error) {
        if (error instanceof BookingConflictError) {
            return sendBookingConflict(res, error);
        }
        if (error instanceof LockBusyError) {
            return res.status(409).json({
                success: false,
                code: 'BOOKING_BUSY',
                message: 'This show is processing another booking. Please retry shortly.',
            });
        }
        const duplicate = isMongoDuplicateKey(error);
        if (duplicate && resolvedShow?._id && userId && seats.length) {
            try {
                const conflict = await findActiveBookingConflict({
                    showId: resolvedShow._id,
                    seats,
                    userId,
                });
                if (conflict) return sendBookingConflict(res, new BookingConflictError(conflict));
            } catch (lookupError) {
                console.error('[createBooking conflict lookup]', lookupError.message);
            }
        }
        const status = duplicate ? 409 : (error.statusCode || (error instanceof TypeError || error instanceof RangeError ? 400 : 500));
        console.error('[createBooking]', error.message);
        return res.status(status).json({
            success: false,
            code: duplicate ? 'SEATS_HELD_BY_ANOTHER_CUSTOMER' : error.code,
            message: duplicate
                ? 'One or more seats were just held by another customer. Please choose again.'
                : (status < 500 ? error.message : 'Unable to create the booking.'),
        });
    }
};

export const getOccupiedSeats = async (req, res) => {
    try {
        const requestedShowId = String(req.params.showId || '');
        if (!requestedShowId) return res.status(400).json({ success: false, message: 'Show ID is required.' });

        const result = await rememberJson(redisKeys.seatMap(requestedShowId), redisTtl.seatMap, async () => {
            const show = await findShowForSeatMap(requestedShowId);
            if (!show) return [];

            const reservations = await SeatReservation.find({
                show: show._id,
                $or: [
                    { status: 'confirmed' },
                    { status: 'held', expiresAt: { $gt: new Date() } },
                ],
            }).select('seat').lean();

            const seats = new Set(Object.keys(show.occupiedSeats || {}));
            for (const reservation of reservations) seats.add(reservation.seat);
            return [...seats].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
        });

        res.set('X-Cache', result.cache).json({ success: true, occupiedSeats: result.value });
    } catch (error) {
        console.error('[getOccupiedSeats]', error.message);
        return res.status(500).json({ success: false, message: 'Unable to load the seat map.' });
    }
};

export const getUserBookings = async (req, res) => {
    try {
        const { userId } = req.auth();
        const bookings = await Booking.find({ user: userId })
            .populate({
                path: 'show',
                populate: { path: 'movie', select: 'title poster_path runtime genres release_date' },
                select: 'showDateTime hall showPrice occupiedSeats',
            })
            .sort({ createdAt: -1 })
            .lean();
        return res.json({ success: true, bookings: bookings.filter((booking) => booking.show?.movie) });
    } catch (error) {
        console.error('[getUserBookings]', error.message);
        return res.status(500).json({ success: false, message: 'Unable to load bookings.' });
    }
};

export const payNowBooking = async (req, res) => {
    let booking;
    try {
        const { userId } = req.auth();
        if (!mongoose.isValidObjectId(req.body.bookingId)) {
            return res.status(400).json({ success: false, message: 'Invalid booking ID.' });
        }
        booking = await Booking.findOne({ _id: req.body.bookingId, user: userId }).populate({
            path: 'show',
            populate: { path: 'movie' },
        });
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
        if (booking.isPaid) return res.status(409).json({ success: false, message: 'Booking is already paid.' });
        if (booking.status === 'expired' || booking.holdExpiresAt <= new Date()) {
            return res.status(410).json({ success: false, message: 'The seat hold expired. Please book again.' });
        }

        await extendActiveHold(booking);
        let origin;
        try {
            origin = getClientOrigin(req);
            const checkout = await createBookingCheckoutSession({
                booking,
                movieTitle: booking.show?.movie?.title,
                origin,
                userId,
            });
            await Booking.updateOne({ _id: booking._id, user: userId, isPaid: false }, {
                paymentLink: checkout.url,
            });
            return res.json({
                success: true,
                bookingId: booking._id,
                holdExpiresAt: booking.holdExpiresAt,
                url: checkout.url,
            });
        } catch (paymentError) {
            logStripeSessionFailure({
                label: '[Pay-now Stripe session failed]',
                error: paymentError,
                booking,
                origin,
            });
            const status = getPaymentErrorStatus(paymentError);
            return res.status(status).json(buildPaymentRetryPayload({
                booking,
                error: paymentError,
                message: getPaymentFailureMessage({ error: paymentError, holdExpiresAt: booking.holdExpiresAt }),
            }));
        }
    } catch (error) {
        const status = error.statusCode || 500;
        console.error('[payNowBooking]', error.message);
        return res.status(status).json({
            success: false,
            code: error.code,
            bookingId: booking?._id,
            holdExpiresAt: booking?.holdExpiresAt,
            message: status === 410 ? error.message : 'Unable to prepare this booking for payment.',
        });
    }
};

export const deleteBooking = async (req, res) => {
    try {
        const { userId } = req.auth();
        const booking = await Booking.findOne({ _id: req.params.id, user: userId }).lean();
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
        if (booking.isPaid) return res.status(409).json({ success: false, message: 'Cannot delete a paid booking.' });

        const show = await Show.findById(booking.show).lean();
        if (!show) return res.status(404).json({ success: false, message: 'Show not found.' });

        await withDistributedLock(
            redisKeys.bookingLock(show._id),
            { ttlMs: redisTtl.bookingLockMs, waitMs: 1000, retryMs: 75 },
            async () => {
                const session = await mongoose.startSession();
                try {
                    await session.withTransaction(async () => {
                        await SeatReservation.deleteMany({ booking: booking._id, status: 'held' }).session(session);

                        const unset = {};
                        for (const seat of booking.bookedSeats) {
                            if (show.occupiedSeats?.[seat] === userId) unset[`occupiedSeats.${seat}`] = '';
                        }
                        if (Object.keys(unset).length) {
                            await Show.updateOne({ _id: show._id }, { $unset: unset }, { session });
                        }
                        await Booking.deleteOne({ _id: booking._id, user: userId, isPaid: false }, { session });
                    });
                } finally {
                    await session.endSession();
                }
            },
        );

        await releaseSeatHolds({ showId: show._id, seats: booking.bookedSeats, bookingId: booking._id });
        await invalidateBookingCaches(show);
        return res.json({ success: true, message: 'Booking cancelled and seats released.' });
    } catch (error) {
        const status = error instanceof LockBusyError ? 409 : 500;
        console.error('[deleteBooking]', error.message);
        return res.status(status).json({
            success: false,
            message: status === 409 ? error.message : 'Unable to cancel the booking.',
        });
    }
};

export const payAllBookings = async (req, res) => {
    let validBookings = [];
    try {
        const { userId } = req.auth();
        const unpaidBookings = await Booking.find({ user: userId, isPaid: false })
            .populate({ path: 'show', populate: { path: 'movie' } });
        if (!unpaidBookings.length) {
            return res.status(404).json({ success: false, message: 'No unpaid bookings found.' });
        }

        const now = new Date();
        const expiredIds = unpaidBookings
            .filter((booking) => booking.status === 'expired' || (booking.holdExpiresAt && booking.holdExpiresAt <= now))
            .map((booking) => booking._id);
        if (expiredIds.length) {
            await Booking.updateMany(
                { _id: { $in: expiredIds }, user: userId, isPaid: false },
                { $set: { status: 'expired', paymentLink: '' } },
            );
        }

        const expiredIdSet = new Set(expiredIds.map(String));
        const candidates = unpaidBookings.filter((booking) => !expiredIdSet.has(String(booking._id)));
        for (const booking of candidates) {
            try {
                await extendActiveHold(booking);
                validBookings.push(booking);
            } catch (error) {
                if (error.statusCode !== 410) throw error;
            }
        }
        if (!validBookings.length) {
            return res.status(410).json({
                success: false,
                message: 'All unpaid booking holds have expired. Please choose seats again.',
            });
        }

        const totalAmount = validBookings.reduce((sum, booking) => sum + Number(booking.amount), 0);
        let origin;
        try {
            origin = getClientOrigin(req);
            const checkout = await createBatchCheckoutSession({
                bookings: validBookings,
                origin,
                userId,
            });
            await Booking.updateMany(
                { _id: { $in: validBookings.map((booking) => booking._id) }, user: userId, isPaid: false },
                { paymentLink: checkout.url },
            );
            return res.json({
                success: true,
                bookingIds: validBookings.map((booking) => booking._id),
                holdExpiresAt: validBookings.reduce((earliest, booking) => (
                    !earliest || booking.holdExpiresAt < earliest ? booking.holdExpiresAt : earliest
                ), null),
                url: checkout.url,
            });
        } catch (paymentError) {
            logStripeSessionFailure({
                label: '[Pay-all Stripe session failed]',
                error: paymentError,
                bookings: validBookings,
                amount: totalAmount,
                origin,
            });
            const holdExpiresAt = validBookings.reduce((earliest, booking) => (
                !earliest || booking.holdExpiresAt < earliest ? booking.holdExpiresAt : earliest
            ), null);
            return res.status(getPaymentErrorStatus(paymentError)).json({
                success: false,
                code: getPaymentErrorCode(paymentError),
                bookingIds: validBookings.map((booking) => booking._id),
                holdExpiresAt,
                retryPayment: true,
                retryEndpoint: '/api/booking/pay-all',
                message: getPaymentFailureMessage({ error: paymentError, holdExpiresAt }),
            });
        }
    } catch (error) {
        console.error('[payAllBookings]', error.message);
        return res.status(error.statusCode || 500).json({
            success: false,
            code: error.code,
            bookingIds: validBookings.map((booking) => booking._id),
            message: error.statusCode === 410 ? error.message : 'Unable to prepare bookings for payment.',
        });
    }
};
