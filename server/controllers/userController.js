import { clerkClient } from "@clerk/express";
import Booking from "../models/Booking.js";
import Movies from "../models/Movie.js";
import {
    createDefaultProfile,
    createProfileCollection,
    deleteProfileFromCollection,
    ProfileValidationError,
    sanitizeProfiles,
    updateProfileCollection,
} from "../services/userProfileService.js";

const PROFILE_METADATA_KEY = 'nitrocineProfiles';

const requireUserId = (req) => {
    const { userId } = req.auth();
    if (!userId) throw new ProfileValidationError('Not authorized.', 401);
    return userId;
};

const getDisplayName = (user) => (
    user.fullName
    || user.firstName
    || user.username
    || user.primaryEmailAddress?.emailAddress?.split('@')[0]
    || 'Bạn'
);

const persistProfiles = async (client, userId, user, profiles) => {
    await client.users.updateUserMetadata(userId, {
        privateMetadata: {
            ...(user.privateMetadata || {}),
            [PROFILE_METADATA_KEY]: profiles,
        },
    });
    return profiles;
};

const handleProfileError = (res, error) => {
    const status = error instanceof ProfileValidationError ? error.status : 500;
    const message = error instanceof ProfileValidationError ? error.message : 'Unable to update profiles.';
    return res.status(status).json({ success: false, message });
};

export const createUserProfileHandlers = (client) => ({
    getProfiles: async (req, res) => {
        try {
            const userId = requireUserId(req);
            const user = await client.users.getUser(userId);
            let profiles = sanitizeProfiles(user.privateMetadata?.[PROFILE_METADATA_KEY]);
            if (!profiles.length) {
                profiles = await persistProfiles(client, userId, user, [createDefaultProfile(getDisplayName(user))]);
            }
            return res.json({ success: true, profiles });
        } catch (error) {
            return handleProfileError(res, error);
        }
    },

    createProfile: async (req, res) => {
        try {
            const userId = requireUserId(req);
            const user = await client.users.getUser(userId);
            const profiles = createProfileCollection(user.privateMetadata?.[PROFILE_METADATA_KEY], req.body);
            await persistProfiles(client, userId, user, profiles);
            return res.status(201).json({ success: true, profiles, profile: profiles.at(-1) });
        } catch (error) {
            return handleProfileError(res, error);
        }
    },

    updateProfile: async (req, res) => {
        try {
            const userId = requireUserId(req);
            const user = await client.users.getUser(userId);
            const profiles = updateProfileCollection(user.privateMetadata?.[PROFILE_METADATA_KEY], req.params.profileId, req.body);
            await persistProfiles(client, userId, user, profiles);
            return res.json({ success: true, profiles, profile: profiles.find((item) => item.id === req.params.profileId) });
        } catch (error) {
            return handleProfileError(res, error);
        }
    },

    deleteProfile: async (req, res) => {
        try {
            const userId = requireUserId(req);
            const user = await client.users.getUser(userId);
            const profiles = deleteProfileFromCollection(user.privateMetadata?.[PROFILE_METADATA_KEY], req.params.profileId);
            await persistProfiles(client, userId, user, profiles);
            return res.json({ success: true, profiles });
        } catch (error) {
            return handleProfileError(res, error);
        }
    },
});

const profileHandlers = createUserProfileHandlers(clerkClient);
export const getProfiles = profileHandlers.getProfiles;
export const createProfile = profileHandlers.createProfile;
export const updateProfile = profileHandlers.updateProfile;
export const deleteProfile = profileHandlers.deleteProfile;

export const resolveFavoriteMovies = async (
    userId,
    {
        getUser = (id) => clerkClient.users.getUser(id),
        findMovies = (ids) => Movies.find({ _id: { $in: ids } }).lean(),
    } = {},
) => {
    const user = await getUser(userId);
    const favorites = user.privateMetadata?.favorites || [];
    if (!favorites.length) return [];
    return findMovies(favorites);
};

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

        const movies = await resolveFavoriteMovies(userId);
        res.json({ success: true, movies });
    } catch (error) {
        console.log('[getFavorites Error]:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
}
