import { clerkClient } from "@clerk/express";
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
const MAX_FAVORITES = 200;
const isValidMovieId = (value) => /^\d{1,12}$/.test(String(value ?? ''));

const failUserRequest = (res, event, error, message, status = 500) => {
    // Client responses must not carry internal failure details (server/AGENTS.md).
    console.error(JSON.stringify({ event, errorCode: error?.code || error?.name || 'UNKNOWN' }));
    return res.status(status).json({ success: false, message });
};

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
    || 'You'
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

// GET /api/user/bookings - Legacy alias for GET /api/booking/my-bookings.
// Re-exported so both routes share one implementation instead of drifting apart.
export { getUserBookings } from './bookingController.js';

// POST /api/user/update-favorite - Toggle favorite movie
export const updateFavorite = async (req, res) => {
    try {
        const { userId } = req.auth();
        if (!userId) {
            return res.status(401).json({ success: false, message: "Not authorized" });
        }
        // Favorites are persisted verbatim into Clerk metadata, so only accept
        // TMDB-shaped IDs instead of arbitrary client strings.
        const movieId = String(req.body?.movieId ?? '');
        if (!isValidMovieId(movieId)) {
            return res.status(400).json({ success: false, message: "A valid movie ID is required." });
        }

        const user = await clerkClient.users.getUser(userId);
        const favorites = (user.privateMetadata?.favorites || []).map(String).filter(isValidMovieId);
        const isFavorite = favorites.includes(movieId);
        if (!isFavorite && favorites.length >= MAX_FAVORITES) {
            return res.status(409).json({
                success: false,
                message: `You can save at most ${MAX_FAVORITES} favorite movies.`,
            });
        }
        const newFavorites = isFavorite
            ? favorites.filter((item) => item !== movieId)
            : [...favorites, movieId];

        await clerkClient.users.updateUserMetadata(userId, {
            privateMetadata: { ...user.privateMetadata, favorites: newFavorites }
        });

        return res.json({ success: true, message: "Favorite movies updated.", favorites: newFavorites });
    } catch (error) {
        return failUserRequest(res, 'update-favorite-failed', error, 'Unable to update favorite movies.');
    }
};

// GET /api/user/favorites - Get user's favorite movies
export const getFavorites = async (req, res) => {
    try {
        const { userId } = req.auth();
        if (!userId) {
            return res.status(401).json({ success: false, message: "Not authorized" });
        }

        const movies = await resolveFavoriteMovies(userId);
        return res.json({ success: true, movies });
    } catch (error) {
        return failUserRequest(res, 'get-favorites-failed', error, 'Unable to load favorite movies.');
    }
};
