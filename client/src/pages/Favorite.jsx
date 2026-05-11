import React, { useState, useEffect } from 'react'
import MovieGrid from '../components/MovieGrid'
import BlurCircle from '../components/BlurCircle'
import Loading from '../components/Loading'

/**
 * Favorite — Displays user's favorited movies from localStorage.
 *
 * CHANGES:
 * 1. Replaced manual MovieCard grid with MovieGrid for scroll animations.
 * 2. No other changes needed — this page already had proper cleanup for
 *    the favoritesUpdated event listener. Good pattern.
 */
const Favorite = () => {
  const [movies, setMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadFavorites = () => {
      try {
        setIsLoading(true);
        const favorites = JSON.parse(localStorage.getItem('nitro_favorites') || '[]');
        setMovies(favorites);
      } catch (error) {
        console.error("Error loading favorites", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadFavorites();

    // Listen for cross-component favorite updates
    const handleUpdate = () => loadFavorites();
    window.addEventListener('favoritesUpdated', handleUpdate);
    return () => window.removeEventListener('favoritesUpdated', handleUpdate);
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

      <h1 className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-20'>My Favorite Movies</h1>

      {movies.length > 0 ? (
        <MovieGrid movies={movies} animated={true} staggerDelay={80} />
      ) : (
        <div className='min-h-[40vh] flex flex-col items-center justify-center'>
          <h2 className='text-2xl font-medium text-center text-gray-400'>You haven't favorited any movies yet.</h2>
        </div>
      )}
    </div>
  );
};

export default Favorite;