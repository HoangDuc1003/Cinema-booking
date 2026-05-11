import React, { useState, useEffect } from 'react'
import MovieCard from '../components/MovieCard'
import BlurCircle from '../components/BlurCircle'
import Loading from '../components/Loading'

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

    const handleUpdate = () => loadFavorites();
    window.addEventListener('favoritesUpdated', handleUpdate);
    return () => window.removeEventListener('favoritesUpdated', handleUpdate);
  }, []);

  if (isLoading) {
    return <Loading />;
  }

  return (
    <div className='relative my-40 mb-60 px-6 md:px-16 lg:px-40 xl:px-44 overflow-hidden min-h-[80vh]'>
      <BlurCircle top='150px' left='0'/>
      <BlurCircle bottom='50px' right='50px'/>

      <h1 className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-20 '>My Favorite Movies</h1>

      {movies.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 w-full">
          {movies.map((movie, index) => (
            <MovieCard movie={movie} key={`${movie.id}-${index}`} />
          ))}
        </div>
      ) : (
        <div className='min-h-[40vh] flex flex-col items-center justify-center'>
            <h1 className='text-2xl font-medium text-center text-gray-400'>You haven't favorited any movies yet.</h1>
        </div>
      )}
    </div>
  );
}

export default Favorite;