import React, { useMemo } from 'react';
import MovieCard from './MovieCard';
import useIntersectionObserver from '../hooks/useIntersectionObserver';

/**
 * @param {Array} movies 
 * @param {string} columns 
 * @param {boolean} animated
 * @param {number} staggerDelay
 */
const MovieGrid = ({
  movies = [],
  columns = 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  animated = true,
  staggerDelay = 30,
}) => {
  const { ref, isVisible } = useIntersectionObserver({
    threshold: 0.01,
    rootMargin: '0px 0px 500px 0px',
    triggerOnce: true,
  });

  const movieItems = useMemo(() => {
    if (!movies || movies.length === 0) return null;

    return movies.map((movie, index) => {
      const key = movie._id || movie.id || index;
      const delay = Math.min(index * staggerDelay, 150);
      const className = animated
        ? `catalog-grid-item ${isVisible ? 'is-visible' : ''}`
        : 'catalog-grid-item is-visible';

      return (
        <div key={key} className={className} style={{ '--catalog-card-delay': `${delay}ms` }}>
          <MovieCard movie={movie} />
        </div>
      );
    });
  }, [movies, animated, staggerDelay, isVisible]);

  if (!movieItems) return null;

  return (
    <div ref={ref} className={`catalog-movie-grid grid ${columns} gap-3 sm:gap-6 w-full`}>
      {movieItems}
    </div>
  );
};

export default React.memo(MovieGrid);
