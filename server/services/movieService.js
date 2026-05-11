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
            importedCount++;
        }
        return { success: true, count: importedCount };
    } catch (error) {
        console.error('Import error:', error);
        throw error;
    }
}
