import React, { useMemo } from 'react';
import MovieCard from './MovieCard';

/**
 * @param {Array} movies 
 * @param {string} columns 
 */
const MovieGrid = ({
  movies = [],
  columns = 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
}) => {
  const movieItems = useMemo(() => {
    if (!movies || movies.length === 0) return null;

    return movies.map((movie, index) => {
      const key = movie._id || movie.id || index;
      return <MovieCard key={key} movie={movie} />;
    });
  }, [movies]);

  if (!movieItems) return null;

  return (
    <div className={`grid ${columns} gap-4 sm:gap-6 w-full`}>
      {movieItems}
    </div>
  );
};

export default React.memo(MovieGrid);
