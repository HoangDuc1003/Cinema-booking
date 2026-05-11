import axios from "axios"
import Movie from "../models/Movie.js"
import Show from "../models/Show.js"
import { importTrendingMoviesLogic } from "../services/movieService.js"

export const getNowPlayingMovies = async (req, res) => {
    try {
        const {data} = await axios.get('https://api.themoviedb.org/3/movie/now_playing', {
            headers:{Authorization: `Bearer ${process.env.TMDB_API_KEY}`},
        })
        const movies = data.results;
        res.json({success: true, movies: movies});
    } catch (error) {
        console.error(error);
        res.json({success: false, error: error.message});
    }
}

//api to add a new show to the database
export const addShow = async (req, res) => {
    try {
        const { movieId, showInput, showPrice } = req.body
        let movie = await Movie.findById(movieId)
        if (!movie) {
            const [movieDetailsResponse, movieCreditsResponse] = await Promise.all([
                axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
                    headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }
                }),
                axios.get(`https://api.themoviedb.org/3/movie/${movieId}/credits`, {
                    headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }
                }),
            ]);

            const movieApiData = movieDetailsResponse.data;
            const movieCreditsData = movieCreditsResponse.data;

            const movieDetails = {
                _id: movieId,
                title: movieApiData.title,
                overview: movieApiData.overview,
                poster_path: movieApiData.poster_path,
                backdrop_path: movieApiData.backdrop_path,
                genres: movieApiData.genres,
                casts: movieCreditsData.cast,
                release_date: movieApiData.release_date,
                original_language: movieApiData.original_language, 
                tagline: movieApiData.tagline || "",
                vote_average: movieApiData.vote_average,
                runtime: movieApiData.runtime,
            };

            movie = await Movie.create(movieDetails);
        }

        const showsToCreate = [];

        showInput.forEach(show => {
            const showDate = show.date;
            show.times.forEach((time) => {
                const dateTimeString = `${showDate}T${time}`;
                showsToCreate.push({
                    movie: movieId,
                    showDateTime: new Date(dateTimeString),
                    showPrice,
                    occupiedSeats: {}
                });
            });
        });

        if (showsToCreate.length > 0) {
            await Show.insertMany(showsToCreate);
        }

        res.json({ success: true, message: 'Show Added successfully.' });

    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
    }
}

export const importTrendingMovies = async (req, res) => {
    try {
        const result = await importTrendingMoviesLogic();
        res.json({ success: true, message: `Successfully imported ${result.count} movies with auto-generated shows!` });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
    }
}

//api to get all shows from database
export const getShows = async (req,res) =>{
    try {
        // First try to get movies that have actual shows in our DB
        const shows = await Show.find({showDateTime:{$gte:new Date()}}).populate('movie').sort({showDateTime:1});
        const uniqueMovies = [];
        const seenIds = new Set();
        
        shows.forEach(show => {
            if (show.movie && !seenIds.has(show.movie._id)) {
                uniqueMovies.push(show.movie);
                seenIds.add(show.movie._id);
            }
        });

        // If we have few or no shows, fetch some "Trending" movies from TMDB to show as "virtual" options
        if (uniqueMovies.length < 10) {
            const { data } = await axios.get('https://api.themoviedb.org/3/movie/now_playing', {
                headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
            });
            
            data.results.forEach(m => {
                const movieId = m.id.toString();
                if (!seenIds.has(movieId)) {
                    uniqueMovies.push({
                        _id: movieId,
                        title: m.title,
                        poster_path: m.poster_path,
                        backdrop_path: m.backdrop_path,
                        vote_average: m.vote_average,
                        release_date: m.release_date,
                        isVirtual: true // Mark as virtual for the frontend if needed
                    });
                    seenIds.add(movieId);
                }
            });
        }
        
        res.json({success:true, shows: uniqueMovies})
    } catch (error) {
        console.log(error);
        res.json({success:false, message:error.message});
    }
} 

export const getShow = async (req,res) => {
    try {
        const {movieId} = req.params;

        if (!movieId || movieId === 'undefined') {
            return res.json({ success: false, message: "Invalid Movie ID" });
        }

        let shows = await Show.find({movie:movieId, showDateTime:{$gte:new Date()}}) 
        let movie = await Movie.findById(movieId); 

        // If movie not found, fetch from TMDB
        if (!movie) {
            const [movieDetailsResponse, movieCreditsResponse] = await Promise.all([
                axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
                    headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }
                }),
                axios.get(`https://api.themoviedb.org/3/movie/${movieId}/credits`, {
                    headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }
                }),
            ]);
            const movieApiData = movieDetailsResponse.data;
            const movieCreditsData = movieCreditsResponse.data;

            movie = {
                _id: movieId,
                title: movieApiData.title,
                overview: movieApiData.overview,
                poster_path: movieApiData.poster_path,
                backdrop_path: movieApiData.backdrop_path,
                genres: movieApiData.genres,
                casts: movieCreditsData.cast,
                release_date: movieApiData.release_date,
                original_language: movieApiData.original_language, 
                tagline: movieApiData.tagline || "",
                vote_average: movieApiData.vote_average,
                runtime: movieApiData.runtime,
            };
        }

        // Virtual show generation logic (instead of auto-inserting)
        const dateTime = {};
        const today = new Date();
        
        // Generate showtimes for the next 7 days
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() + i);
            const dateString = date.toISOString().split('T')[0];
            
            // Standard times for every movie
            const standardTimes = ["10:00", "13:30", "17:00", "20:30"];
            
            if (!dateTime[dateString]) {
                dateTime[dateString] = [];
            }

            standardTimes.forEach(time => {
                const dateTimeString = `${dateString}T${time}:00.000Z`;
                const showDT = new Date(dateTimeString);
                
                // Only show future showtimes
                if (showDT < today) return;

                // Check if this show already exists in DB
                const existingShow = shows.find(s => s.showDateTime.getTime() === showDT.getTime());
                
                if (existingShow) {
                    dateTime[dateString].push({
                        time: existingShow.showDateTime, 
                        showId: existingShow._id,
                        price: existingShow.showPrice,
                        hall: "Standard Hall",
                        isVirtual: false
                    });
                } else {
                    // Generate a "virtual" show ID that can be used for booking
                    // Format: virtual_<movieId>_<timestamp>
                    const virtualId = `virtual_${movieId}_${showDT.getTime()}`;
                    dateTime[dateString].push({
                        time: showDT, 
                        showId: virtualId,
                        price: 50, // Default virtual price
                        hall: "Standard Hall",
                        isVirtual: true
                    });
                }
            });
        }
        
        res.json({success:true, movie, dateTime})
    } catch (error) {
        console.log(error);
        res.json({success:false, message:error.message});
    }
}
export default { getNowPlayingMovies, addShow, importTrendingMovies, getShows, getShow }