import React, { useCallback, useState, useEffect } from 'react';
import { StarIcon, Calendar, Clock, Play, Heart, Film } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import timeFormat from '../lib/timeFormat';
import { fetchMovieDetails } from '../services/tmdb';

const readStoredFavorites = () => {
  try {
    const value = JSON.parse(localStorage.getItem('nitro_favorites') || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const MovieCard = ({ movie, hydrateRuntime = true }) => {
  const [hasImageError, setHasImageError] = useState(false);
  const movieId = movie._id || movie.id;
  const movieHref = `/movies/${movieId}`;

  const handleNavigate = useCallback(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, []);

  const releaseYear = movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A';
  const isNumeric = (v) => v != null && !isNaN(Number(v));

  const [runtimeMinutes, setRuntimeMinutes] = useState(() => {
    if (isNumeric(movie.runtime)) return Number(movie.runtime);
    if (isNumeric(movie.duration)) return Number(movie.duration);
    return null;
  });

  const [isFavorited, setIsFavorited] = useState(false);

  useEffect(() => {
    const favorites = readStoredFavorites();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsFavorited(favorites.some((favorite) => String(favorite.id || favorite._id) === String(movieId)));
  }, [movieId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasImageError(false);
  }, [movie.id, movie._id, movie.poster_path, movie.backdrop_path, movie.poster]);

  const toggleFavorite = (e) => {
    e.stopPropagation();
    const favorites = readStoredFavorites();
    let newFavorites;
    if (isFavorited) {
      newFavorites = favorites.filter((favorite) => String(favorite.id || favorite._id) !== String(movieId));
      toast.success('Removed from favorites');
    } else {
      newFavorites = [...favorites, movie];
      toast.success('Added to favorites');
    }
    localStorage.setItem('nitro_favorites', JSON.stringify(newFavorites));
    setIsFavorited(!isFavorited);
    window.dispatchEvent(new Event('favoritesUpdated'));
  };

  useEffect(() => {
    const controller = new AbortController();
    if (hydrateRuntime && runtimeMinutes == null) {
      const tmdbId = movie.id || (movie._id && !isNaN(Number(movie._id)) ? Number(movie._id) : null);
      if (tmdbId) {
        fetchMovieDetails(tmdbId, {
          signal: controller.signal,
          fallbackMode: 'none',
        })
          .then((data) => {
            if (controller.signal.aborted) return;
            if (isNumeric(data?.runtime)) setRuntimeMinutes(Number(data.runtime));
          })
          .catch(() => {});
      }
    }
    return () => controller.abort();
  }, [hydrateRuntime, runtimeMinutes, movie.id, movie._id]);

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
    <article className="movie-card group">
      <Link
        to={movieHref}
        onClick={handleNavigate}
        className="movie-card__main"
        aria-label={`Xem chi tiết ${title}`}
      >
        {showPosterFallback ? (
          <span className="movie-card__fallback" role="img" aria-label={`Không có poster cho ${title}`}>
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
        <span className="movie-card__play" aria-hidden="true"><Play /></span>

        <span className="movie-card__info">
          <span className="movie-card__title">{title}</span>
          <span className="movie-card__meta">
            <span><Calendar aria-hidden="true" />{releaseYear}</span>
            {runtimeMinutes != null && <span><Clock aria-hidden="true" />{timeFormat(runtimeMinutes)}</span>}
          </span>
        </span>
      </Link>

      <span className="movie-card__rating" aria-label={`Điểm ${rating}`}>
        <StarIcon aria-hidden="true" />
        {rating}
      </span>

      <button
        type="button"
        onClick={toggleFavorite}
        className="movie-card__favorite"
        aria-label={isFavorited ? `Bỏ ${title} khỏi yêu thích` : `Thêm ${title} vào yêu thích`}
        aria-pressed={isFavorited}
      >
        <Heart aria-hidden="true" className={isFavorited ? 'is-favorited' : ''} />
      </button>

      <Link to={movieHref} onClick={handleNavigate} className="movie-card__cta">
        <Play aria-hidden="true" />
        Đặt vé
      </Link>
    </article>
  );
};

export default React.memo(MovieCard);
