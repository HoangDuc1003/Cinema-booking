import React, { useState, useEffect } from 'react'
import { fetchPopularMovies } from '../services/tmdb';
import MovieCard from '../components/MovieCard'
import BlurCircle from '../components/BlurCircle'

// feat: Component displaying all available movies
const Movies = () => {
  // chore: State management for movies list and loading
  const [movies, setMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // feat: Fetch all movies on component mount
  useEffect(() => {
    const loadMovies = async () => {
      try {
        setIsLoading(true);
        const data = await fetchPopularMovies();
        setMovies(data); 
      } catch (error) {
        // fix: Corrected error message grammar
        console.error("No movies available", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMovies(); 
  }, []);

  // feat: Loading state UI
  if (isLoading) {
    return (
      <div className='min-h-[80vh] flex items-center justify-center'>
        <h1 className='text-3xl font-bold text-white'>Loading movies...</h1>
      </div>
    );
  }

  // feat: Movies list or empty state
  return movies.length > 0 ? (
    <>
      {/* chore: Animation styles for gradient effect */}
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

      {/* feat: Main movies grid container */}
      <div className='relative pt-30 mb-60 px-6 md:px-16 lg:px-40 xl:px-44 overflow-hidden min-h-[80vh]'>
        
        {/* chore: Gradient background effect */}
        <div 
          className="absolute left-1/2 -translate-x-1/2 w-[150%] h-45 bg-red-600/80 rounded-[100%] blur-[120px] 
          animate-slow-pulse pointer-events-none"
          style={{ top: '-20px', zIndex: 0 }}
        ></div>

        {/* chore: Decorative blur circles */}
        <BlurCircle top='150px' left='0'/>
        <BlurCircle bottom='50px' right='50px'/>
        
        {/* feat: Movies grid layout */}
        <div className="relative z-10">
          {/* feat: Section title */}
          <h1 className='text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-20'>
            Now Showing
          </h1>
          {/* feat: Movies list in responsive grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 w-full">
            {movies.map((movie) => (
              <MovieCard movie={movie} key={movie._id} />
            ))}
          </div>
        </div>

      </div>
    </>
  ) : (
    // feat: Empty state message
    <div className='min-h-[80vh] flex items-center justify-center'>
        <h1 className='text-3xl font-bold text-center text-white'>No movies available</h1>
    </div>
  )
}

export default Movies;