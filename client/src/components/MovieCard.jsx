import React, { useCallback, useState, useEffect, useRef } from 'react';
import { StarIcon, Calendar, Clock, Play, Heart, Film, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import timeFormat from '../lib/timeFormat';
import { useSaveData } from './hero/useHeroEnvironment';
import { isFavorite, toggleFavorite as toggleStoredFavorite, useFavorites } from '../lib/favorites';

const MovieCard = ({ movie, ctaLabel = 'Book tickets' }) => {
  const [hasImageError, setHasImageError] = useState(false);
  const cardRef = useRef(null);
  const motionFrameRef = useRef(null);
  const saveData = useSaveData();
  const movieId = movie._id || movie.id;
  const movieHref = `/movies/${movieId}`;

  const handleNavigate = useCallback(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, []);

  const resetCardMotion = useCallback(() => {
    if (motionFrameRef.current != null) {
      window.cancelAnimationFrame(motionFrameRef.current);
      motionFrameRef.current = null;
    }
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty('--movie-card-rotate-x', '0deg');
    card.style.setProperty('--movie-card-rotate-y', '0deg');
    card.style.setProperty('--movie-card-glare-x', '50%');
    card.style.setProperty('--movie-card-glare-y', '30%');
  }, []);

  const handlePointerMove = useCallback((event) => {
    if (
      !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      || saveData
    ) return;
    const card = cardRef.current;
    if (!card) return;
    const { clientX, clientY } = event;
    if (motionFrameRef.current != null) window.cancelAnimationFrame(motionFrameRef.current);
    motionFrameRef.current = window.requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      card.style.setProperty('--movie-card-rotate-x', `${((0.5 - y) * 5).toFixed(2)}deg`);
      card.style.setProperty('--movie-card-rotate-y', `${((x - 0.5) * 5).toFixed(2)}deg`);
      card.style.setProperty('--movie-card-glare-x', `${(x * 100).toFixed(1)}%`);
      card.style.setProperty('--movie-card-glare-y', `${(y * 100).toFixed(1)}%`);
      motionFrameRef.current = null;
    });
  }, [saveData]);

  useEffect(() => resetCardMotion, [resetCardMotion]);

  const releaseYear = movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A';
  const isNumeric = (v) => v != null && !isNaN(Number(v));

  const runtimeMinutes = (() => {
    if (isNumeric(movie.runtime)) return Number(movie.runtime);
    if (isNumeric(movie.duration)) return Number(movie.duration);
    return null;
  })();

  const isFavorited = isFavorite(useFavorites(), movie);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasImageError(false);
  }, [movie.id, movie._id, movie.poster_path, movie.backdrop_path, movie.poster]);

  const toggleFavorite = (e) => {
    e.stopPropagation();
    const favorited = toggleStoredFavorite(movie);
    if (favorited === null) toast.error('Your browser blocked saving favorites.');
    else toast.success(favorited ? 'Added to favorites' : 'Removed from favorites');
  };

  const ratingValue = Number(movie.vote_average ?? movie.rating);
  const rating = Number.isFinite(ratingValue) ? ratingValue.toFixed(1) : '0.0';

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path.replace('/t/p/original/', '/t/p/w500/');
    return `https://image.tmdb.org/t/p/w500${path}`;
  };

  const imageSrc = getImageUrl(movie.poster_path || movie.backdrop_path || movie.poster);
  const showPosterFallback = !imageSrc || hasImageError;
  const title = movie.title || movie.name || 'Untitled';

  return (
    <article
      ref={cardRef}
      className={`movie-card group${saveData ? ' is-data-saving' : ''}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetCardMotion}
      onFocusCapture={resetCardMotion}
    >
      <Link
        to={movieHref}
        onClick={handleNavigate}
        className="movie-card__main"
        aria-label={`View details for ${title}`}
      >
        {showPosterFallback ? (
          <span className="movie-card__fallback" role="img" aria-label={`No poster available for ${title}`}>
            <Film aria-hidden="true" />
            <span>{title}</span>
          </span>
        ) : (
          <img
            src={imageSrc}
            alt={`Poster ${title}`}
            loading="lazy"
            decoding="async"
            onError={() => setHasImageError(true)}
            className="movie-card__poster"
          />
        )}

        <span className="movie-card__scrim" aria-hidden="true" />
        <span className="movie-card__glare" aria-hidden="true" />
        <span className="movie-card__play" aria-hidden="true"><Play /></span>

        <span className="movie-card__info">
          <span className="movie-card__title">{title}</span>
          <span className="movie-card__meta">
            <span><Calendar aria-hidden="true" />{releaseYear}</span>
            {runtimeMinutes != null && <span><Clock aria-hidden="true" />{timeFormat(runtimeMinutes)}</span>}
          </span>
        </span>
      </Link>

      <span className="movie-card__rating" aria-label={`Rating ${rating}`}>
        <StarIcon aria-hidden="true" />
        {rating}
      </span>

      <button
        type="button"
        onClick={toggleFavorite}
        className="movie-card__favorite"
        aria-label={isFavorited ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
        aria-pressed={isFavorited}
      >
        <Heart aria-hidden="true" className={isFavorited ? 'is-favorited' : ''} />
      </button>

      <Link to={movieHref} onClick={handleNavigate} className="movie-card__cta">
        {ctaLabel === 'View details' ? <ArrowRight aria-hidden="true" /> : <Play aria-hidden="true" />}
        {ctaLabel}
      </Link>
    </article>
  );
};

export default React.memo(MovieCard);
