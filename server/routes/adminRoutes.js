import express from 'express'
import { protectAdmin } from '../middleware/auth.js';
import { getAllBookings, getDashboardData, getHeroSettings, isAdmin, getAllShows, updateHeroSettings } from '../controllers/adminController.js';

const adminRouter = express.Router();

adminRouter.get('/is-admin', protectAdmin,isAdmin)
adminRouter.get('/dashboard', protectAdmin,getDashboardData)
adminRouter.get('/hero', protectAdmin,getHeroSettings)
adminRouter.put('/hero', protectAdmin,updateHeroSettings)
adminRouter.get('/all-shows', protectAdmin,getAllShows)
adminRouter.get('/all-bookings', protectAdmin,getAllBookings)

export default adminRouter;
