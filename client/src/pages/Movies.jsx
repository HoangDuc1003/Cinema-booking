import React, { useState, useEffect } from 'react'
import { fetchPopularMovies } from '../services/tmdb';
import MovieCard from '../components/MovieCard'
import BlurCircle from '../components/BlurCircle'

const Movies = () => {
  const [movies, setMovies] = useState([]);
  
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    const loadMovies = async () => {
      try {
        setIsLoading(true);
        const data = await fetchPopularMovies();
        setMovies(data); 
      } catch (error) {
        console.error("Not Movies Available", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMovies(); 
  }, []);


  if (isLoading) {
    return (
      <div className='min-h-[80vh] flex items-center justify-center'>
        <h1 className='text-3xl font-bold text-white'>Loading data movies...</h1>
      </div>
    );
  }


  return movies.length > 0 ? (
    <div className='relative my-40 mb-60 px-6 md:px-16 lg:px-40 xl:px-44 overflow-hidden min-h-[80vh]'>
      <BlurCircle top='150px' left='0'/>
      <BlurCircle bottom='50px' right='50px'/>
      <h1 className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-20 '>Now Showing</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 w-full">
        {movies.map((movie) => (
          <MovieCard movie={movie} key={movie._id} />
        ))}
      </div>
    </div>
  ) : (
    <div className='min-h-[80vh] flex items-center justify-center'>
        <h1 className='text-3xl font-bold text-center text-white'>No movies available</h1>
    </div>
  )
}

export default Movies