const API_KEY = '127bc7f7c148cade2892233946154212';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://media.themoviedb.org/t/p/original';

export const fetchPopularMovies = async () => {
    try {
        const response = await fetch(`${BASE_URL}/movie/popular?api_key=${API_KEY}&language=en-en&page=1`);
        if (!response.ok) throw new Error("Network error!");
        const data = await response.json();
        
        const moviesWithRuntime = await Promise.all(
            data.results.map(async (movie) => {
                const detailResponse = await fetch(`${BASE_URL}/movie/${movie.id}?api_key=${API_KEY}&language=vi-VN`);
                const detailData = await detailResponse.json();
                
                return {
                    _id: movie.id.toString(),
                    id: movie.id,
                    title: movie.title,
                    overview: movie.overview,
                    poster_path: `${IMAGE_BASE_URL}${movie.poster_path}`,
                    backdrop_path: `${IMAGE_BASE_URL}${movie.backdrop_path}`,
                    release_date: movie.release_date,
                    vote_average: movie.vote_average,
                    vote_count: movie.vote_count,
                    movieruntime: detailData.runtime, 
                };
            })
        );

        return moviesWithRuntime;
    } catch (error) {
        console.error("Loading movies error:", error);
        return []; 
    }
}