import React from 'react';
import MovieCard from './MovieCard';
import useScrollReveal from '../hooks/useScrollReveal';

/**
 * One card plus its own reveal trigger. Observing per card (instead of once for
 * the whole grid) is what makes the effect track the scroll: rows animate in as
 * they reach the viewport rather than all at once when the grid is first seen.
 */
const GridItem = ({ movie, delay, animated, ctaLabel }) => {
  const { ref, isRevealed } = useScrollReveal();
  return (
    <div
      ref={ref}
      className={`catalog-grid-item${animated && isRevealed ? ' is-entering' : ''}`}
      style={{ '--catalog-card-delay': `${delay}ms` }}
    >
      <MovieCard movie={movie} ctaLabel={ctaLabel} />
    </div>
  );
};

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
  ctaLabel,
}) => {
  if (!movies?.length) return null;

  return (
    <div className={`catalog-movie-grid grid ${columns} w-full gap-3 sm:gap-6`}>
      {movies.map((movie, index) => (
        <GridItem
          key={movie._id || movie.id || index}
          movie={movie}
          animated={animated}
          ctaLabel={ctaLabel}
          // Stagger inside a row only; a long list must not accumulate delay.
          delay={(index % 5) * staggerDelay}
        />
      ))}
    </div>
  );
};

export default React.memo(MovieGrid);
