import React from 'react';
import { CalendarIcon, ClockIcon, Info, LoaderCircle, Play, Star, Ticket, Volume2, VolumeX } from 'lucide-react';
import { HERO_FAILURE_REASONS } from './heroMachine';

const HeroContent = ({
  movieKey,
  generation,
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
  trailerMode,
  failureReason,
  onBook,
  onDetails,
  onToggleTrailer,
  showVolumeControl,
  muted,
  onToggleMuted,
  volume = 0.35,
  volumeStep = 0.05,
  onVolumeChange,
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
  const compactClass = isCompactEffective && disclosureState !== 'compacting' ? 'is-compact' : '';
  const isOverviewRevealedEffective = overviewRevealed || disclosureState === 'expanded' || disclosureState === 'expanding';
  const stateClass = disclosureState ? `is-${disclosureState}` : '';
  const overviewCollapsed = isCompactEffective && !isOverviewRevealedEffective;
  const trailerUnavailable = failureReason === HERO_FAILURE_REASONS.MISSING_VIDEO
    || trailerAvailable === false;

  const contentKey = `${movieKey || movie.id || movie._id || title}-${generation || 0}`;
  const flyDirection = (index || 0) % 2 === 0 ? 'hero-fly-left' : 'hero-fly-right';

  const isSectionMode = trailerMode === 'section';
  const isNativeMode = trailerMode === 'native';
  const effectiveTrailerFailed = trailerFailed && !isSectionMode;
  const effectiveTrailerUnavailable = trailerUnavailable && isNativeMode;

  const trailerLabel = trailerLoading
    ? 'Loading\u2026'
    : effectiveTrailerUnavailable
      ? 'Trailer unavailable'
      : effectiveTrailerFailed
        ? 'Retry trailer'
        : 'Trailer';

  const showTrailerButton = !trailerActive;

  const handleBlur = (event) => {
    if (onBlurCapture) {
      onBlurCapture(event);
    } else if (!event.currentTarget.contains(event.relatedTarget)) {
      onScheduleRecompact?.(event.currentTarget);
    }
  };

  return (
    <div
      className={`hero-content-zone ${compactClass} ${isOverviewRevealedEffective ? 'is-overview-revealed' : ''} ${stateClass}`.trim()}
      tabIndex={overviewCollapsed ? 0 : -1}
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
      aria-label={overviewCollapsed ? `Show full description for ${title}` : undefined}
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

        <p className="hero-overview hero-fade-up d3" aria-hidden="false">
          {movie.overview}
        </p>

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
              disabled={trailerLoading || effectiveTrailerUnavailable}
              aria-busy={trailerLoading}
              aria-label={`${trailerLabel} for ${title}`}
              className="hero-action hero-action--secondary"
            >
              {trailerLoading
                ? <LoaderCircle className="hero-action__spinner" aria-hidden="true" />
                : <Play aria-hidden="true" />}
              <span>{trailerLabel}</span>
            </button>
          )}
          {showVolumeControl && (
            <div className="hero-volume-control" data-hero-sound-control>
              <button
                type="button"
                data-hero-sound-control
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
              <div
                className="hero-volume-popover"
                role="group"
                aria-label="Trailer volume controls"
              >
                <VolumeX aria-hidden="true" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step={volumeStep}
                  value={volume}
                  aria-label="Trailer volume"
                  aria-valuetext={`${Math.round(volume * 100)} percent${muted ? ', muted' : ''}`}
                  onChange={(event) => onVolumeChange?.(event.target.value)}
                />
                <Volume2 aria-hidden="true" />
                <span className="hero-volume-value">{Math.round(volume * 100)}%</span>
              </div>
            </div>
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
