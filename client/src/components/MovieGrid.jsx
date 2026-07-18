import React, { useMemo } from 'react';
import MovieCard from './MovieCard';
import useIntersectionObserver from '../hooks/useIntersectionObserver';

/**
 * @param {Array} movies 
 * @param {string} columns 
 * @param {boolean} animated
 * @param {number} staggerDelay
 * @param {boolean} hydrateRuntime
 */
const MovieGrid = ({
  movies = [],
  columns = 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
  animated = true,
  staggerDelay = 35,
  hydrateRuntime = true,
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
      const delay = Math.min(index * staggerDelay, 180);
      const itemStyle = animated
        ? {
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'translate3d(0, 0, 0)' : 'translate3d(0, 24px, 0)',
            transition: `opacity 500ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 650ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
            willChange: isVisible ? 'auto' : 'opacity, transform',
          }
        : undefined;

      return (
        <div key={key} style={itemStyle}>
          <MovieCard movie={movie} hydrateRuntime={hydrateRuntime} />
        </div>
      );
    });
  }, [movies, animated, staggerDelay, hydrateRuntime, isVisible]);

  if (!movieItems) return null;

  return (
    <div ref={ref} className={`grid ${columns} gap-4 sm:gap-6 w-full`}>
      {movieItems}
    </div>
  );
};

export default React.memo(MovieGrid);
