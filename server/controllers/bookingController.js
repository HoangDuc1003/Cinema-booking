import axios from "axios"
import Movie from "../models/Movie.js"
import Show from "../models/Show.js"
import Booking from "../models/Booking.js"
import stripe from 'stripe'

// Check if selected seats are still available
const checkSeatsAvailability = async (showId, selectedSeats) => {
    try {
        if (showId.startsWith('virtual_') || showId.startsWith('mock_')) return true;
        const showData = await Show.findById(showId)
        if (!showData) return false;
        return !selectedSeats.some(seat => showData.occupiedSeats[seat]);
    } catch (error) {
        console.log(error.message);
        return false;
    }
}

// Extract client origin from request headers (fallback-safe)
const getOrigin = (req) => {
    if (req.headers.origin) return req.headers.origin;
    if (req.headers.referer) {
        const url = new URL(req.headers.referer);
        return url.origin;
    }
    return `${req.protocol}://${req.headers.host}`;
}

// Fetch movie from TMDB and save to DB
const ensureMovieExists = async (movieId) => {
    const id = String(movieId);
    let movie = await Movie.findById(id);
    if (movie) return movie;
    const [details, credits] = await Promise.all([
        axios.get(`https://api.themoviedb.org/3/movie/${id}`, {
            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }
        }),
        axios.get(`https://api.themoviedb.org/3/movie/${id}/credits`, {
            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }
        })
    ]);
    return await Movie.create({
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
        tagline: details.data.tagline || "",
        original_language: details.data.original_language
    });
}

// Create Stripe checkout session for a booking
const createStripeSession = async (booking, movieTitle, origin) => {
    const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);
    const amount = Number(booking.amount);
    if (!amount || amount <= 0) {
        throw new Error(`Invalid booking amount: ${booking.amount}`);
    }
    const session = await stripeInstance.checkout.sessions.create({
        success_url: `${origin}/loading/my-bookings`,
        cancel_url: `${origin}/my-bookings`,
        line_items: [{
            price_data: {
                currency: 'usd',
                product_data: { name: movieTitle || 'Movie Ticket' },
                unit_amount: Math.round(amount * 100)
            },
            quantity: 1
        }],
        mode: 'payment',
        metadata: { bookingId: booking._id.toString() },
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60
    });
    booking.paymentLink = session.url;
    await booking.save();
    return session.url;
}

// POST /api/booking/create - Create booking and redirect to Stripe
export const createBooking = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { showId, selectedSeats, totalAmount } = req.body;
        const origin = getOrigin(req);

        const isAvailable = await checkSeatsAvailability(showId, selectedSeats)
        if (!isAvailable) {
            return res.json({ success: false, message: "Selected seats are not available" });
        }

        let actualShowId = showId;
        let showData;

        // Handle virtual/mock IDs — create Show in DB on-the-fly
        if (showId.startsWith('virtual_') || showId.startsWith('mock_')) {
            let movieId, parsedDate, hallName, showPrice;

            if (showId.startsWith('virtual_')) {
                const parts = showId.split('_');
                movieId = String(parts[1]);
                parsedDate = new Date(parseInt(parts[2]));
                hallName = 'Virtual Hall';
                showPrice = 50;
            } else {
                movieId = String(req.body.movieId);
                parsedDate = new Date(req.body.showDateTime);
                hallName = req.body.hall || 'NitroCine Premium';
                showPrice = Number(req.body.price) || 50;
            }

            // Check if show already exists
            showData = await Show.findOne({ movie: movieId, showDateTime: parsedDate, hall: hallName });

            if (!showData) {
                await ensureMovieExists(movieId);
                showData = await Show.create({
                    movie: movieId,
                    showDateTime: parsedDate,
                    hall: hallName,
                    showPrice: showPrice,
                    occupiedSeats: {}
                });
            }
            actualShowId = showData._id;
            // Populate movie for Stripe product name
            showData = await Show.findById(actualShowId).populate('movie');
        } else {
            showData = await Show.findById(showId).populate('movie');
        }

        if (!showData) {
            return res.json({ success: false, message: "Show not found" });
        }

        // Use frontend-calculated total (includes seat-type multipliers), fallback to flat price
        const bookingAmount = totalAmount || showData.showPrice * selectedSeats.length;

        // Create booking record
        const booking = await Booking.create({
            user: userId,
            show: actualShowId,
            amount: bookingAmount,
            bookedSeats: selectedSeats
        })

        // Mark seats as occupied
        selectedSeats.forEach(seat => { showData.occupiedSeats[seat] = userId; });
        showData.markModified('occupiedSeats');
        await showData.save();

        res.json({ success: true, message: "Booking created successfully" });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// GET /api/booking/seat/:showId - Get occupied seats for a show
export const getOccupiedSeats = async (req, res) => {
    try {
        const { showId } = req.params;
        if (showId.startsWith('virtual_') || showId.startsWith('mock_')) {
            return res.json({ success: true, occupiedSeats: [] });
        }
        const showData = await Show.findById(showId)
        if (!showData) return res.json({ success: true, occupiedSeats: [] });
        res.json({ success: true, occupiedSeats: Object.keys(showData.occupiedSeats) });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// GET /api/booking/my-bookings - Get all bookings for current user
export const getUserBookings = async (req, res) => {
    try {
        const { userId } = req.auth();
        const bookings = await Booking.find({ user: userId })
            .populate({ path: 'show', populate: { path: 'movie' } })
            .sort({ createdAt: -1 });
        res.json({ success: true, bookings });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// POST /api/booking/pay-now - Generate new Stripe session for unpaid booking
export const payNowBooking = async (req, res) => {
    try {
        const { bookingId } = req.body;
        const origin = getOrigin(req);

        const booking = await Booking.findById(bookingId).populate({
            path: 'show',
            populate: { path: 'movie' }
        });

        if (!booking) return res.json({ success: false, message: "Booking not found" });
        if (booking.isPaid) return res.json({ success: false, message: "Already paid" });

        // Create new Stripe session and redirect
        const url = await createStripeSession(booking, booking.show.movie.title, origin);
        res.json({ success: true, url });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// DELETE /api/booking/:id - Delete an unpaid booking
export const deleteBooking = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { id } = req.params;

        const booking = await Booking.findOne({ _id: id, user: userId }).populate('show');
        if (!booking) {
            return res.json({ success: false, message: "Booking not found" });
        }

        if (booking.isPaid) {
            return res.json({ success: false, message: "Cannot delete a paid booking" });
        }

        // Free up the occupied seats in the show
        if (booking.show) {
            const showData = booking.show;
            const updatedSeats = { ...showData.occupiedSeats };
            
            booking.bookedSeats.forEach(seat => {
                // Only free the seat if it belongs to this user (extra safety)
                if (updatedSeats[seat] === userId) {
                    delete updatedSeats[seat];
                }
            });
            
            showData.occupiedSeats = updatedSeats;
            showData.markModified('occupiedSeats');
            await showData.save();
        }

        // Delete the booking record
        await Booking.findByIdAndDelete(id);

        res.json({ success: true, message: "Booking deleted successfully" });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// POST /api/booking/pay-all - Generate Stripe session for multiple unpaid bookings
export const payAllBookings = async (req, res) => {
    try {
        const { userId } = req.auth();
        const origin = getOrigin(req);

        // Find all unpaid bookings for this user
        const unpaidBookings = await Booking.find({ user: userId, isPaid: false }).populate({
            path: 'show',
            populate: { path: 'movie' }
        });

        if (!unpaidBookings.length) {
            return res.json({ success: false, message: "No unpaid bookings found" });
        }

        const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);
        
        // Calculate total amount
        const totalAmount = unpaidBookings.reduce((sum, booking) => sum + Number(booking.amount), 0);
        
        // Get all IDs
        const bookingIds = unpaidBookings.map(b => b._id.toString()).join(',');

        if (!totalAmount || totalAmount <= 0) {
            throw new Error(`Invalid total amount: ${totalAmount}`);
        }

        // We combine them into a single line item for simplicity, 
        // or we could map them to multiple line items. Let's use a single combined ticket.
        const session = await stripeInstance.checkout.sessions.create({
            success_url: `${origin}/loading/my-bookings`,
            cancel_url: `${origin}/my-bookings`,
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { 
                        name: 'NitroCine Multiple Tickets',
                        description: `Payment for ${unpaidBookings.length} movie bookings.`
                    },
                    unit_amount: Math.round(totalAmount * 100)
                },
                quantity: 1
            }],
            mode: 'payment',
            metadata: { bookingIds }, // Store the comma-separated list of IDs
            expires_at: Math.floor(Date.now() / 1000) + 30 * 60
        });

        // Update all bookings with this payment link
        for (const booking of unpaidBookings) {
            booking.paymentLink = session.url;
            await booking.save();
        }

        res.json({ success: true, url: session.url });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}