import express from 'express';
import { requireAuth } from '@clerk/express';
import {
    createProfile,
    deleteProfile,
    getFavorites,
    getProfiles,
    getUserBookings,
    updateFavorite,
    updateProfile,
} from '../controllers/userController.js';

const userRouter = express.Router();

userRouter.get('/bookings', requireAuth(), getUserBookings)
userRouter.post('/update-favorite', requireAuth(), updateFavorite)
userRouter.get('/favorites', requireAuth(), getFavorites)
userRouter.get('/profiles', requireAuth(), getProfiles)
userRouter.post('/profiles', requireAuth(), createProfile)
userRouter.patch('/profiles/:profileId', requireAuth(), updateProfile)
userRouter.delete('/profiles/:profileId', requireAuth(), deleteProfile)

export default userRouter;
