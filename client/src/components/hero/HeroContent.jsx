import React from 'react';
import { CalendarIcon, ClockIcon, Info, LoaderCircle, Play, Star, Ticket } from 'lucide-react';
import HeroControls from './HeroControls';

const HeroContent = ({
  movie,
  year,
  runtime,
  rating,
  compact,
  overviewRevealed,
  trailerActive,
  trailerLoading,
  trailerFailed,
  failureReason,
  onBook,
  onDetails,
  onToggleTrailer,
  showVolumeControl,
  muted,
  onToggleMuted,
  onReveal,
  onScheduleRecompact,
  onCancelRecompact,
}) => {
  const title = movie.title || movie.name || '';
  const overviewHidden = compact && !overviewRevealed;
  const trailerLabel = trailerLoading
    ? 'Loading\u2026'
    : trailerActive
      ? 'Poster'
      : trailerFailed
        ? 'Retry'
        : 'Trailer';

  const handleBlur = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      onScheduleRecompact?.(event.currentTarget);
    }
  };

  return (
    <div
      className={`hero-content-zone ${compact ? 'is-compact' : ''} ${overviewRevealed ? 'is-overview-revealed' : ''}`}
      tabIndex={overviewHidden ? 0 : -1}
      onMouseEnter={onReveal}
      onMouseLeave={(event) => onScheduleRecompact?.(event.currentTarget)}
      onFocusCapture={() => {
        onCancelRecompact?.();
        onReveal?.();
      }}
      onBlurCapture={handleBlur}
      aria-label={overviewHidden ? `Show description for ${title}` : undefined}
    >
      <h1 className="hero-title cinematic-shadow">
        {title.split(/\s+/).map((word, index, words) => (
          <span key={`${word}-${index}`} className="hero-title__word" style={{ '--word-index': index }}>
            {word}{index < words.length - 1 ? '\u00A0' : ''}
          </span>
        ))}
      </h1>

      <div className="hero-content-details">
        {movie.genres?.length > 0 && (
          <div className="hero-genres">
            {movie.genres.slice(0, 3).map((genre) => (
              <span key={genre.id || genre.name}>{genre.name}</span>
            ))}
          </div>
        )}

        <div className="hero-meta cinematic-shadow">
          <span><CalendarIcon aria-hidden="true" />{year}</span>
          <span><ClockIcon aria-hidden="true" />{runtime}</span>
          <span><Star className="hero-rating-icon" aria-hidden="true" />{rating}</span>
        </div>

        <p className="hero-overview" aria-hidden={overviewHidden}>
          {movie.overview}
        </p>

        {trailerFailed && (
          <p className="hero-trailer-status" role="status">
            {`Trailer unavailable (${failureReason}). You can retry.`}
          </p>
        )}

        <div className={`hero-actions ${showVolumeControl ? 'has-volume-control' : ''}`}>
          <button type="button" onClick={onBook} className="hero-action hero-action--primary">
            <Ticket aria-hidden="true" />
            <span>Book Now</span>
          </button>
          <button
            type="button"
            onClick={onToggleTrailer}
            disabled={trailerLoading}
            aria-busy={trailerLoading}
            className="hero-action hero-action--secondary"
          >
            {trailerLoading
              ? <LoaderCircle className="hero-action__spinner" aria-hidden="true" />
              : <Play aria-hidden="true" />}
            <span>{trailerLabel}</span>
          </button>
          {showVolumeControl && (
            <HeroControls
              muted={muted}
              onToggleMuted={onToggleMuted}
            />
          )}
          <button type="button" onClick={onDetails} className="hero-action hero-action--details">
            <Info aria-hidden="true" />
            <span>Details</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(HeroContent);
