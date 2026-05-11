import React, { useState, useEffect } from 'react'
import { fetchPopularMovies } from '../services/tmdb';
import MovieCard from '../components/MovieCard'
import BlurCircle from '../components/BlurCircle'
import Loading from '../components/Loading'


const Movies = () => {

  const [movies, setMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  
  useEffect(() => {
    const loadMovies = async () => {
      try {
        setIsLoading(true);
        const data = await fetchPopularMovies({ dailyRotate: true, dailySeedSize: 20, pages: 2, maxAdult: 2 });
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

  // feat: Movies list or empty state
  return movies.length > 0 ? (
    <>

      <style>
        {`
          @keyframes slowPulseBand {
            0%, 100% { opacity: 0.25; transform: scaleX(1) translateY(0); }
            50%      { opacity: 0.65; transform: scaleX(1.05) translateY(-5px); }
          }
          .animate-slow-pulse {
            animation: slowPulseBand 6s ease-in-out infinite;
          } 
        `}
      </style>


      <div className='relative pt-30 mb-5 px-6 md:px-16 lg:px-40 xl:px-44 overflow-hidden min-h-[80vh]'>


        <div
          className="absolute left-1/2 -translate-x-1/2 w-[150%] h-45 rounded-[100%] blur-[120px] 
          animate-slow-pulse pointer-events-none"
          style={{ top: '-20px', zIndex: 0, background: 'rgba(0, 123, 255, 0.5)' }}
        ></div>

        <BlurCircle top='150px' left='0' />
        <BlurCircle bottom='50px' right='50px' />
        <BlurCircle top='50px' left='400px' />
        <BlurCircle top='100px' right='0' />


        <div className="relative z-10">

          <h1 className='text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-20'>
            Now Showing
          </h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 w-full">
            {movies.map((movie, index) => (
              <MovieCard movie={movie} key={`${movie._id}-${index}`} />
            ))}
          </div>
        </div>

      </div>
    </>
  ) : (

    <div className='min-h-[80vh] flex items-center justify-center'>
      <h1 className='text-3xl font-bold text-center text-white'>No movies available</h1>
    </div>
  )
}

export default Movies;