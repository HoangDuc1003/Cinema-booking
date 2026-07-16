import express from 'express'
import { protectAdmin } from '../middleware/auth.js';
import { getAllBookings, getDashboardData, getHeroSettings, isAdmin, getAllShows, updateHeroSettings, getHeroVideoSignature, commitHeroVideoAction, removeHeroVideoAction, refreshCatalogAction, getCatalogRefreshStatusAction } from '../controllers/adminController.js';

const adminRouter = express.Router();

adminRouter.get('/is-admin', protectAdmin,isAdmin)
adminRouter.get('/dashboard', protectAdmin,getDashboardData)
adminRouter.get('/hero', protectAdmin,getHeroSettings)
adminRouter.put('/hero', protectAdmin,updateHeroSettings)
adminRouter.get('/hero/upload-signature', protectAdmin, getHeroVideoSignature)
adminRouter.post('/hero/:movieId/commit', protectAdmin, commitHeroVideoAction)
adminRouter.delete('/hero/:movieId/video', protectAdmin, removeHeroVideoAction)
adminRouter.get('/all-shows', protectAdmin,getAllShows)
adminRouter.get('/all-bookings', protectAdmin,getAllBookings)
adminRouter.post('/catalog/refresh', protectAdmin, refreshCatalogAction)
adminRouter.get('/catalog/refresh/:runId', protectAdmin, getCatalogRefreshStatusAction)

export default adminRouter;

