import { clerkClient } from "@clerk/express";
import Booking from "../models/Booking.js";
import Movies from "../models/Movie.js";

// GET /api/user/bookings - Get user bookings
export const getUserBookings = async (req, res) => {
    try {
        const { userId } = req.auth();
        if (!userId) {
            return res.status(401).json({ success: false, message: "Not authorized" });
        }
        const bookings = await Booking.find({ user: userId }).populate({
            path: 'show',
            populate: { path: "movie" }
        }).sort({ createdAt: -1 }).lean();

        // Filter out bookings with deleted shows/movies
        const validBookings = bookings.filter(b => b.show && b.show.movie);
        res.json({ success: true, bookings: validBookings });
    } catch (error) {
        console.log('[getUserBookings Error]:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
}

// POST /api/user/update-favorite - Toggle favorite movie
export const updateFavorite = async (req, res) => {
    try {
        const { movieId } = req.body;
        const { userId } = req.auth();
        if (!userId) {
            return res.status(401).json({ success: false, message: "Not authorized" });
        }

        const user = await clerkClient.users.getUser(userId);
        const favorites = user.privateMetadata?.favorites || [];

        let newFavorites;
        if (favorites.includes(movieId)) {
            newFavorites = favorites.filter(item => item !== movieId);
        } else {
            newFavorites = [...favorites, movieId];
        }

        await clerkClient.users.updateUserMetadata(userId, {
            privateMetadata: { ...user.privateMetadata, favorites: newFavorites }
        });

        res.json({ success: true, message: "Favorite movies updated." });
    } catch (error) {
        console.log('[updateFavorite Error]:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
}

// GET /api/user/favorites - Get user's favorite movies
export const getFavorites = async (req, res) => {
    try {
        const { userId } = req.auth();
        if (!userId) {
            return res.status(401).json({ success: false, message: "Not authorized" });
        }

        const user = await clerkClient.users.getUser(userId);
        const favorites = user.privateMetadata?.favorites || [];

        if (!favorites.length) {
            return res.json({ success: true, movies: [] });
        }

        const movies = await Movies.find({ _id: { $in: favorites } }).lean();
        res.json({ success: true, movies });
    } catch (error) {
        console.log('[getFavorites Error]:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
}