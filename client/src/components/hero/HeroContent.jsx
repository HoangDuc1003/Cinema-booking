import React from 'react';
import { CalendarIcon, ClockIcon, Info, LoaderCircle, Play, Square, Star, Ticket, Volume2, VolumeX } from 'lucide-react';

const HeroContent = ({
  movieKey,
  index,
  movie,
  year,
  runtime,
  rating,
  compact,
  overviewRevealed,
  disclosureState,
  trailerActive,
  trailerLoading,
  trailerFailed,
  trailerAvailable,
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
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onFocusCapture,
  onBlurCapture,
  onCompactTitleClick,
  onCtaClick,
}) => {
  const title = movie.title || movie.name || '';
  const isCompactEffective = compact || disclosureState === 'compact' || disclosureState === 'compacting';
  const isOverviewRevealedEffective = overviewRevealed || disclosureState === 'expanded' || disclosureState === 'expanding';
  const stateClass = disclosureState ? `is-${disclosureState}` : '';
  const overviewHidden = isCompactEffective && !isOverviewRevealedEffective;

  const contentKey = movieKey || movie.id || movie._id || title;
  const flyDirection = (index || 0) % 2 === 0 ? 'hero-fly-left' : 'hero-fly-right';

  const trailerLabel = trailerLoading
    ? 'Loading\u2026'
    : trailerActive
      ? 'Poster'
      : trailerFailed
        ? 'Retry'
        : 'Trailer';

  const showTrailerButton = trailerAvailable !== false || trailerActive || trailerLoading || trailerFailed;

  const handleBlur = (event) => {
    if (onBlurCapture) {
      onBlurCapture(event);
    } else if (!event.currentTarget.contains(event.relatedTarget)) {
      onScheduleRecompact?.(event.currentTarget);
    }
  };

  return (
    <div
      className={`hero-content-zone ${isCompactEffective ? 'is-compact' : ''} ${isOverviewRevealedEffective ? 'is-overview-revealed' : ''} ${stateClass}`.trim()}
      tabIndex={overviewHidden ? 0 : -1}
      onMouseEnter={(event) => {
        onPointerEnter?.(event);
        onReveal?.(event);
      }}
      onMouseMove={(event) => onPointerMove?.(event)}
      onMouseLeave={(event) => {
        onPointerLeave?.(event);
        onScheduleRecompact?.(event.currentTarget);
      }}
      onFocusCapture={(event) => {
        onFocusCapture?.(event);
        onCancelRecompact?.();
        onReveal?.();
      }}
      onBlurCapture={handleBlur}
      aria-label={overviewHidden ? `Show description for ${title}` : undefined}
    >
      <h1
        key={`title-${contentKey}`}
        className="hero-title cinematic-shadow"
        onClick={isCompactEffective ? onCompactTitleClick : undefined}
        style={isCompactEffective ? { cursor: 'pointer' } : undefined}
        title={isCompactEffective ? 'Click to show movie details' : undefined}
      >
        {title.split(/\s+/).map((word, wordIndex, words) => {
          const animName = wordIndex % 2 === 0 ? 'charFromLeft' : 'charFromRight';
          return (
            <span
              key={`${word}-${wordIndex}`}
              className="hero-title__word inline-block whitespace-nowrap will-change-transform"
              style={{
                animation: `${animName} 700ms cubic-bezier(0.22, 1, 0.36, 1) ${wordIndex * 80}ms both`,
              }}
            >
              {word}{wordIndex < words.length - 1 ? '\u00A0' : ''}
            </span>
          );
        })}
      </h1>

      <div key={`details-${contentKey}`} className="hero-content-details">
        {movie.genres?.length > 0 && (
          <div className="hero-genres hero-fade-up d1">
            {movie.genres.slice(0, 3).map((genre) => (
              <span key={genre.id || genre.name}>{genre.name}</span>
            ))}
          </div>
        )}

        <div className="hero-meta cinematic-shadow hero-fade-up d2">
          <span><CalendarIcon aria-hidden="true" />{year}</span>
          <span><ClockIcon aria-hidden="true" />{runtime}</span>
          <span><Star className="hero-rating-icon" aria-hidden="true" />{rating}</span>
        </div>

        <p className="hero-overview hero-fade-up d3" aria-hidden={overviewHidden}>
          {movie.overview}
        </p>

        {trailerFailed && (
          <p className="hero-trailer-status hero-fade-up d3" role="status">
            {`Trailer unavailable (${failureReason}). You can retry.`}
          </p>
        )}

        <div className={`hero-actions hero-fade-up d4 ${showVolumeControl ? 'has-volume-control' : ''}`}>
          <button
            type="button"
            onClick={() => {
              onCtaClick?.();
              onBook();
            }}
            className="hero-action hero-action--primary"
          >
            <Ticket aria-hidden="true" />
            <span>Book Now</span>
          </button>
          {showTrailerButton && (
            <button
              type="button"
              onClick={() => {
                onCtaClick?.();
                onToggleTrailer();
              }}
              disabled={trailerLoading}
              aria-busy={trailerLoading}
              className="hero-action hero-action--secondary"
            >
              {trailerLoading
                ? <LoaderCircle className="hero-action__spinner" aria-hidden="true" />
                : trailerActive
                  ? <Square aria-hidden="true" />
                  : <Play aria-hidden="true" />}
              <span>{trailerLabel}</span>
            </button>
          )}
          {showVolumeControl && (
            <button
              type="button"
              onClick={() => {
                onCtaClick?.();
                onToggleMuted();
              }}
              aria-label={muted ? 'Turn trailer sound on' : 'Mute trailer'}
              aria-pressed={!muted}
              className="hero-control hero-control--icon"
            >
              {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onCtaClick?.();
              onDetails();
            }}
            className="hero-action hero-action--details"
          >
            <Info aria-hidden="true" />
            <span>Details</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(HeroContent);
