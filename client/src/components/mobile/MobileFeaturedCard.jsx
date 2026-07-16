import React from 'react';
import { Info, Star, Ticket } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const imageUrl = (path) => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `https://image.tmdb.org/t/p/w780${path}`;
};

const MobileFeaturedCard = ({ movie }) => {
  const navigate = useNavigate();
  if (!movie) return <div className="mobile-featured-card mobile-featured-card--placeholder" aria-hidden="true" />;
  const movieId = movie._id || movie.id;
  const goToMovie = () => navigate(`/movies/${movieId}`);
  return (
    <article className="mobile-featured-card" data-testid="mobile-featured-card">
      <img src={imageUrl(movie.poster_path || movie.poster || movie.backdrop_path)} alt={`Poster ${movie.title}`} fetchPriority="high" />
      <div className="mobile-featured-card__shade" />
      <div className="mobile-featured-card__content">
        <div className="mobile-featured-card__meta">
          {movie.vote_average && <span><Star aria-hidden="true" /> {Number(movie.vote_average).toFixed(1)}</span>}
          {movie.release_date && <span>{String(movie.release_date).slice(0, 4)}</span>}
        </div>
        <h1>{movie.title}</h1>
        <p>{movie.overview || 'Khám phá câu chuyện đang được yêu thích tại NitroCine.'}</p>
        <div className="mobile-featured-card__actions">
          <button type="button" className="mobile-primary-button" onClick={goToMovie}><Ticket /> Đặt vé</button>
          <button type="button" className="mobile-secondary-button" onClick={goToMovie}><Info /> Chi tiết</button>
        </div>
      </div>
    </article>
  );
};

export default MobileFeaturedCard;

