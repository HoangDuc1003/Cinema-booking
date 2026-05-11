import React, { useState, useEffect } from 'react'
import { fetchUpcomingMovies } from '../services/tmdb'
import MovieCard from '../components/MovieCard'
import BlurCircle from '../components/BlurCircle'
import Loading from '../components/Loading'

const Release = () => {
  const [movies, setMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadMovies = async () => {
      try {
        setIsLoading(true);
        const data = await fetchUpcomingMovies();
        setMovies(data);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    loadMovies();
  }, []);

  if (isLoading) return <Loading />;

  return (
    <div className='relative my-40 mb-60 px-6 md:px-16 lg:px-40 xl:px-44 overflow-hidden min-h-[80vh]'>
      <BlurCircle top='150px' left='0'/>
      <BlurCircle bottom='50px' right='50px'/>
      <h1 className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-20 '>Upcoming Releases</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 w-full">
        {movies.map((movie, index) => (
          <MovieCard movie={movie} key={`${movie.id}-${index}`} />
        ))}
      </div>
    </div>
  );
}

export default Release;
