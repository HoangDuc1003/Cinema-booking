import React from 'react';
import { CalendarIcon, ClockIcon, Info, Star, Ticket } from 'lucide-react';

const HeroContent = ({
  movieKey,
  generation,
  index,
  movie,
  year,
  runtime,
  rating,
  onBook,
  onDetails,
}) => {
  const title = movie.title || movie.name || '';
  const contentKey = `${movieKey || movie.id || movie._id || title}-${generation || 0}`;
  const flyDirection = (index || 0) % 2 === 0 ? 'hero-fly-left' : 'hero-fly-right';

  return (
    <div className="hero-content-zone">
      <h1 key={`title-${contentKey}`} className="hero-title cinematic-shadow">
        {title.split(/\s+/).map((word, wordIndex, words) => {
          const animation = wordIndex % 2 === 0 ? 'charFromLeft' : 'charFromRight';
          return (
            <span
              key={`${word}-${wordIndex}`}
              className="hero-title__word inline-block whitespace-nowrap will-change-transform"
              style={{
                animation: `${animation} 700ms cubic-bezier(0.22, 1, 0.36, 1) ${wordIndex * 80}ms both`,
              }}
            >
              {word}{wordIndex < words.length - 1 ? '\u00A0' : ''}
            </span>
          );
        })}
      </h1>

      <div key={`details-${contentKey}`} className={`hero-content-details ${flyDirection}`}>
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

        <p className="hero-overview hero-fade-up d3">{movie.overview}</p>

        <div className="hero-actions hero-fade-up d4">
          <button type="button" onClick={onBook} className="hero-action hero-action--primary">
            <Ticket aria-hidden="true" />
            <span>Book Now</span>
          </button>
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
