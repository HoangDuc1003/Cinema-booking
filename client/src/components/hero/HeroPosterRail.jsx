import React, { useState } from 'react';

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

const HeroPosterRail = ({ movies, currentIndex, getThumbnailUrls, onSelect, className = '', hidden = false }) => (
  <div
    className={`hero-poster-rail ${hidden ? 'is-hidden' : ''} ${className}`.trim()}
    aria-label="Hero movie navigation"
    aria-hidden={hidden ? true : undefined}
    inert={hidden ? true : undefined}
  >
    <div className="hero-poster-rail__progress" aria-hidden="true">
      {movies.map((movie, index) => (
        <span key={movie.id || movie._id || index} className={index === currentIndex ? 'is-active' : ''} />
      ))}
    </div>
    <div className="hero-poster-rail__items">
      {movies.map((movie, index) => {
        const active = index === currentIndex;
        const thumbnailUrls = getThumbnailUrls(movie);
        return (
          <button
            type="button"
            key={movie.id || movie._id || index}
            onClick={() => onSelect(index)}
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

export default React.memo(HeroPosterRail);
