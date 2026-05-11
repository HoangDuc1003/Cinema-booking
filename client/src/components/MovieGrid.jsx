import React, { useMemo } from 'react';
import MovieCard from './MovieCard';
import AnimatedCard from './AnimatedCard';

/**
 * @param {Array} movies 
 * @param {string} columns 
 * @param {boolean} animated 
 * @param {number} staggerDelay 
 */
const MovieGrid = ({
  movies = [],
  columns = 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
  animated = true,
  staggerDelay = 80,
}) => {
  const movieItems = useMemo(() => {
    if (!movies || movies.length === 0) return null;

    return movies.map((movie, index) => {
      const key = movie._id || movie.id || index;
      const card = <MovieCard movie={movie} />;

      if (animated) {
        return (
          <AnimatedCard key={key} index={index} staggerDelay={staggerDelay}>
            {card}
          </AnimatedCard>
        );
      }

      return <React.Fragment key={key}>{card}</React.Fragment>;
    });
  }, [movies, animated, staggerDelay]);

  if (!movieItems) return null;

  return (
    <div className={`grid ${columns} gap-4 sm:gap-6 w-full`}>
      {movieItems}
    </div>
  );
};

export default React.memo(MovieGrid);
