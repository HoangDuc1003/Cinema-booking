import React, { useState, useEffect } from 'react'
import { fetchUpcomingMovies } from '../services/tmdb'
import MovieGrid from '../components/MovieGrid'
import BlurCircle from '../components/BlurCircle'
import Loading from '../components/Loading'

/**
 * Release — Upcoming movie releases.
 *
 * CHANGES:
 * 1. Replaced manual MovieCard grid with MovieGrid for scroll animations.
 * 2. Added mounted flag to prevent setState on unmounted component.
 */
const Release = () => {
  const [movies, setMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadMovies = async () => {
      try {
        setIsLoading(true);
        const data = await fetchUpcomingMovies();
        if (mounted) setMovies(data);
      } catch (error) {
        console.error(error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadMovies();
    return () => { mounted = false; };
  }, []);

  if (isLoading) return <Loading />;

  return (
    <div className='relative pt-30 mb-60 px-6 md:px-16 lg:px-40 xl:px-44 overflow-hidden min-h-[80vh]'>
      {/* Blue glow band */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[150%] h-45 rounded-[100%] blur-[120px] animate-slow-pulse pointer-events-none"
        style={{ top: '-20px', zIndex: 0, background: 'rgba(0, 123, 255, 0.5)' }}
      />
      <BlurCircle top='150px' left='0'/>
      <BlurCircle bottom='50px' right='50px'/>
      <h1 className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-20'>Upcoming Releases</h1>
      <MovieGrid movies={movies} animated={true} staggerDelay={80} />
    </div>
  );
};

export default Release;
