import express from 'express'
import { addShow, getCinemas, getNowPlayingMovies, getShow, getShows, importTrendingMovies } from '../controllers/showController.js';
import { protectAdmin } from '../middleware/auth.js';
const showRouter = express.Router();

showRouter.get('/now-playing',protectAdmin,getNowPlayingMovies)
showRouter.get('/import-trending', protectAdmin, importTrendingMovies)
showRouter.post('/add',protectAdmin ,addShow)
showRouter.get('/all',getShows)
showRouter.get('/cinemas',getCinemas)
showRouter.get('/:movieId',getShow)

export default showRouter;
