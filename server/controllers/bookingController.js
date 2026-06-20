import axios from 'axios';
import mongoose from 'mongoose';
import Stripe from 'stripe';
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

const getOrigin = (req) => {
    if (process.env.CLIENT_URL) return process.env.CLIENT_URL.replace(/\/$/, '');
    if (process.env.NODE_ENV === 'production') {
        throw new Error('CLIENT_URL must be configured in production.');
    }
    if (req.headers.origin) return req.headers.origin;
    if (req.headers.referer) return new URL(req.headers.referer).origin;
    return `${req.protocol}://${req.headers.host}`;
};

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

const createStripeSession = async (booking, movieTitle, origin) => {
    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error('Stripe is not configured.');
    }

    const amount = Number(booking.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid booking amount.');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
        success_url: `${origin}/loading/my-bookings`,
        cancel_url: `${origin}/my-bookings`,
        line_items: [{
            price_data: {
                currency: 'usd',
                product_data: { name: movieTitle || 'NitroCine Ticket' },
                unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
        }],
        mode: 'payment',
        metadata: { bookingId: booking._id.toString() },
        expires_at: Math.floor(Date.now() / 1000) + redisTtl.seatHold,
    });

    await Booking.updateOne({ _id: booking._id, isPaid: false }, { paymentLink: session.url });
    return session.url;
};

const invalidateBookingCaches = async (show, alias = null) => invalidateSeatAvailability({
    showId: String(show._id),
    movieId: String(show.movie?._id || show.movie),
    aliases: alias ? [alias] : [],
});

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
    try {
        await ensureCriticalIndexes();
        const { userId } = req.auth();
        const showId = String(req.body.showId || '');
        const seats = normalizeSeats(req.body.selectedSeats);
        const show = await resolveShow({ ...req.body, showId });
        if (!show) return res.status(404).json({ success: false, message: 'Show not found.' });

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

        try {
            const movie = await Movie.findById(show.movie).select('title').lean();
            const url = await createStripeSession(result, movie?.title, getOrigin(req));
            return res.status(201).json({
                success: true,
                bookingId: result._id,
                holdExpiresAt: result.holdExpiresAt,
                url,
                message: 'Seats held. Complete payment before the hold expires.',
            });
        } catch (stripeError) {
            console.error('[Stripe session]', stripeError.message);
            return res.status(502).json({
                success: false,
                bookingId: result._id,
                message: 'Seats are held, but the payment link could not be created. Retry from My Bookings.',
            });
        }
    } catch (error) {
        const conflict = error instanceof LockBusyError || isMongoDuplicateKey(error) || error.statusCode === 409;
        const status = conflict ? 409 : (error.statusCode || (error instanceof TypeError || error instanceof RangeError ? 400 : 500));
        console.error('[createBooking]', error.message);
        return res.status(status).json({
            success: false,
            message: conflict
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
    try {
        const { userId } = req.auth();
        const booking = await Booking.findOne({ _id: req.body.bookingId, user: userId }).populate({
            path: 'show',
            populate: { path: 'movie' },
        });
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
        if (booking.isPaid) return res.status(409).json({ success: false, message: 'Booking is already paid.' });
        if (booking.status === 'expired' || booking.holdExpiresAt <= new Date()) {
            return res.status(410).json({ success: false, message: 'The seat hold expired. Please book again.' });
        }

        await extendActiveHold(booking);
        const url = await createStripeSession(booking, booking.show?.movie?.title, getOrigin(req));
        return res.json({ success: true, url });
    } catch (error) {
        console.error('[payNowBooking]', error.message);
        return res.status(500).json({ success: false, message: 'Unable to create a payment link.' });
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
    try {
        const { userId } = req.auth();
        const bookings = await Booking.find({
            user: userId,
            isPaid: false,
            $or: [
                { status: 'pending', holdExpiresAt: { $gt: new Date() } },
                { holdExpiresAt: { $exists: false } },
            ],
        }).populate({ path: 'show', populate: { path: 'movie' } });
        if (!bookings.length) return res.status(404).json({ success: false, message: 'No active unpaid bookings found.' });
        if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ success: false, message: 'Stripe is not configured.' });

        for (const booking of bookings) await extendActiveHold(booking);
        const totalAmount = bookings.reduce((sum, booking) => sum + Number(booking.amount), 0);
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const checkout = await stripe.checkout.sessions.create({
            success_url: `${getOrigin(req)}/loading/my-bookings`,
            cancel_url: `${getOrigin(req)}/my-bookings`,
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'NitroCine Multiple Tickets',
                        description: `Payment for ${bookings.length} movie bookings.`,
                    },
                    unit_amount: Math.round(totalAmount * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            metadata: { bookingIds: bookings.map((booking) => booking._id).join(',') },
            expires_at: Math.floor(Date.now() / 1000) + redisTtl.seatHold,
        });

        await Booking.updateMany(
            { _id: { $in: bookings.map((booking) => booking._id) }, user: userId, isPaid: false },
            { paymentLink: checkout.url },
        );
        return res.json({ success: true, url: checkout.url });
    } catch (error) {
        console.error('[payAllBookings]', error.message);
        return res.status(500).json({ success: false, message: 'Unable to create a payment link.' });
    }
};
