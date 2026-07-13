import React from 'react';

const HeroPosterRail = ({ movies, currentIndex, getThumbnailUrl, onSelect }) => (
  <div className="hero-poster-rail" aria-label="Hero movie navigation">
    <div className="hero-poster-rail__progress" aria-hidden="true">
      {movies.map((movie, index) => (
        <span key={movie.id || movie._id || index} className={index === currentIndex ? 'is-active' : ''} />
      ))}
    </div>
    <div className="hero-poster-rail__items">
      {movies.map((movie, index) => {
        const active = index === currentIndex;
        return (
          <button
            type="button"
            key={movie.id || movie._id || index}
            onClick={() => onSelect(index)}
            aria-current={active ? 'true' : undefined}
            aria-label={`Show ${movie.title || movie.name}`}
            className={`hero-poster-thumb ${active ? 'is-active' : ''}`}
          >
            <img src={getThumbnailUrl(movie)} alt="" loading="lazy" decoding="async" />
            <span>{movie.title || movie.name}</span>
          </button>
        );
      })}
    </div>
  </div>
);

export default React.memo(HeroPosterRail);
