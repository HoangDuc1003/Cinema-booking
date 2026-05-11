import React, { useMemo } from 'react';
import MovieCard from './MovieCard';
import AnimatedCard from './AnimatedCard';

/**
 * MovieGrid — Reusable grid layout for movie cards with scroll animations.
 *
 * WHY extract this:
 * The exact same grid + MovieCard mapping pattern was duplicated in 5 places:
 * Movies.jsx, FeatureSection.jsx, Favorite.jsx, Release.jsx, MovieDetails.jsx.
 * Each had slightly different grid column configs but identical logic.
 * DRY principle: one change here updates all 5 locations.
 *
 * WHY useMemo on movieItems:
 * Without memo, the .map() creates new React elements on EVERY parent re-render,
 * even if `movies` array hasn't changed. useMemo skips the mapping entirely
 * unless `movies` reference changes. Combined with React.memo on MovieCard,
 * this eliminates unnecessary re-renders of the entire grid.
 *
 * @param {Array} movies - Array of movie objects
 * @param {string} columns - Tailwind grid column classes (default: responsive 1-4 cols)
 * @param {boolean} animated - Whether to wrap cards in AnimatedCard (default: true)
 * @param {number} staggerDelay - Ms between each card's animation (default: 80)
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
