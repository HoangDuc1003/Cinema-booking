import React, { useState, useEffect } from 'react'
import { fetchPopularMovies } from '../services/tmdb';
import MovieCard from '../components/MovieCard'
import BlurCircle from '../components/BlurCircle'
import Loading from '../components/Loading'


const Favorite = () => {

  const [movies, setMovies] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  

  useEffect(() => {
    const loadMovies = async () => {
      try {
        setIsLoading(true);
        const data = await fetchPopularMovies();
        setMovies(data); 
        setHasError(false);
      } catch (error) {

        console.error("No movies available", error);
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadMovies(); 
  }, []);



  if (isLoading) {
    return <Loading />;
  }

  if (hasError) {
    return <Loading />;
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

export default Favorite