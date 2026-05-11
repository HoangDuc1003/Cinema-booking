import axios from "axios"
import Movie from "../models/Movie.js"
import Show from "../models/Show.js"

export const importTrendingMoviesLogic = async () => {
    try {
        const { data } = await axios.get('https://api.themoviedb.org/3/trending/movie/day', {
            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }
        });
        
        const trendingMovies = data.results.slice(0, 10);
        let importedCount = 0;

        for (const m of trendingMovies) {
            const movieId = m.id.toString();
            let movie = await Movie.findById(movieId);

            if (!movie) {
                const [details, credits] = await Promise.all([
                    axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
                        headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }
                    }),
                    axios.get(`https://api.themoviedb.org/3/movie/${movieId}/credits`, {
                        headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }
                    })
                ]);

                movie = await Movie.create({
                    _id: movieId,
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

            // Create default shows for next 3 days
            const today = new Date();
            const showsToCreate = [];
            for (let i = 0; i < 3; i++) {
                const d = new Date(today);
                d.setDate(d.getDate() + i);
                const dStr = d.toISOString().split('T')[0];
                const times = ["10:00", "14:00", "19:00"];

                for (const t of times) {
                    const dt = new Date(`${dStr}T${t}:00.000Z`);
                    const existing = await Show.findOne({ movie: movieId, showDateTime: dt });
                    if (!existing) {
                        showsToCreate.push({
                            movie: movieId,
                            showDateTime: dt,
                            showPrice: 50,
                            occupiedSeats: {}
                        });
                    }
                }
            }
            if (showsToCreate.length > 0) {
                await Show.insertMany(showsToCreate);
            }
            importedCount++;
        }
        return { success: true, count: importedCount };
    } catch (error) {
        console.error('Import error:', error);
        throw error;
    }
}
