import React, { useEffect, useRef, useState } from 'react';

const HeroPosterThumbnail = ({ sources }) => {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const source = sources[sourceIndex] || '';

  if (!source) return <i className="hero-poster-thumb__fallback" aria-hidden="true" />;

  return (
    <img
      src={source}
      alt=""
      loading="lazy"
      decoding="async"
      className={ready ? 'is-ready' : 'is-loading'}
      onLoad={() => setReady(true)}
      onError={() => {
        setReady(false);
        setSourceIndex((index) => Math.min(index + 1, sources.length));
      }}
    />
  );
};

const HeroPosterRail = ({
  movies,
  currentIndex,
  getThumbnailUrls,
  onSelect,
  onEngagedChange,
  // { key, durationMs, running } for the active slide's countdown, or null when
  // the carousel does not advance on its own.
  progress = null,
  className = '',
  hidden = false,
}) => {
  const itemsRef = useRef(null);

  // Where the rail overflows (phones), keep the slide that just came up in view.
  // Scrolls the rail only: scrollIntoView could also drag the page back up.
  useEffect(() => {
    const rail = itemsRef.current;
    const active = rail?.children[currentIndex];
    if (!rail || !active || rail.scrollWidth <= rail.clientWidth) return;
    const railBox = rail.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    if (activeBox.left >= railBox.left && activeBox.right <= railBox.right) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    rail.scrollTo({
      left: rail.scrollLeft + activeBox.left - railBox.left - (railBox.width - activeBox.width) / 2,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [currentIndex]);

  return (
    <div
      className={`hero-poster-rail ${hidden ? 'is-hidden' : ''} ${className}`.trim()}
      aria-label="Hero movie navigation"
      aria-hidden={hidden ? true : undefined}
      inert={hidden ? true : undefined}
      style={hidden ? { pointerEvents: 'none' } : undefined}
      onPointerEnter={() => onEngagedChange?.(true)}
      onPointerLeave={() => onEngagedChange?.(false)}
      onFocus={() => onEngagedChange?.(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onEngagedChange?.(false);
      }}
    >
      <div
        className={`hero-poster-rail__progress ${progress && !progress.running ? 'is-paused' : ''}`.trim()}
        aria-hidden="true"
      >
        {movies.map((movie, index) => {
          const active = index === currentIndex;
          const counting = active && progress;
          return (
            <span
              key={movie.id || movie._id || index}
              className={`${active ? 'is-active' : ''} ${counting ? 'is-counting' : ''}`.trim() || undefined}
            >
              {counting && (
                // Keyed by slide, so every slide starts its bar from empty;
                // pausing only freezes the animation where it is.
                <i
                  key={progress.key}
                  className="hero-poster-rail__fill"
                  style={{ animationDuration: `${progress.durationMs}ms` }}
                />
              )}
            </span>
          );
        })}
      </div>
      <div className="hero-poster-rail__items" ref={itemsRef}>
        {movies.map((movie, index) => {
          const active = index === currentIndex;
          const thumbnailUrls = getThumbnailUrls(movie);
          return (
            <button
              type="button"
              key={movie.id || movie._id || index}
              // Re-picking the slide on screen would replay the transition for nothing.
              onClick={() => { if (!active) onSelect(index); }}
              aria-current={active ? 'true' : undefined}
              aria-label={`Show ${movie.title || movie.name}`}
              className={`hero-poster-thumb ${active ? 'is-active' : ''}`}
            >
              <HeroPosterThumbnail
                key={thumbnailUrls.join('|')}
                sources={thumbnailUrls}
              />
              <span>{movie.title || movie.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(HeroPosterRail);
