import express from 'express'
import {
    addShow,
    getCinemas,
    getHomeHero,
    getNowPlayingMovies,
    getShow,
    getShows,
    getTmdbMovie,
    getTmdbImage,
    getTmdbHomeNowShowing,
    getTmdbNowPlaying,
    getTmdbPopular,
    getTmdbTrailers,
    getTmdbUpcoming,
    getTmdbVideos,
    importTrendingMovies,
    searchTmdbMovies,
} from '../controllers/showController.js';
import { protectAdmin } from '../middleware/auth.js';
const showRouter = express.Router();

showRouter.get('/now-playing',protectAdmin,getNowPlayingMovies)
showRouter.get('/import-trending', protectAdmin, importTrendingMovies)
showRouter.post('/add',protectAdmin ,addShow)
showRouter.get('/hero', getHomeHero)
showRouter.get('/all',getShows)
showRouter.get('/cinemas',getCinemas)
showRouter.get('/tmdb/popular', getTmdbPopular)
showRouter.get('/tmdb/upcoming', getTmdbUpcoming)
showRouter.get('/tmdb/now-playing', getTmdbNowPlaying)
showRouter.get('/tmdb/home-now-showing', getTmdbHomeNowShowing)
showRouter.get('/tmdb/image', getTmdbImage)
showRouter.get('/tmdb/trailers', getTmdbTrailers)
showRouter.get('/tmdb/search', searchTmdbMovies)
showRouter.get('/tmdb/movie/:movieId/videos', getTmdbVideos)
showRouter.get('/tmdb/movie/:movieId', getTmdbMovie)
showRouter.get('/:movieId',getShow)

export default showRouter;
