import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MovieCard from '../MovieCard';

const MobileMovieRail = ({ title, movies = [], viewAllPath = '/movies' }) => {
  const navigate = useNavigate();
  if (!movies.length) return null;
  return (
    <section className="mobile-movie-rail" aria-label={title}>
      <div className="mobile-movie-rail__heading">
        <h2>{title}</h2>
        <button type="button" onClick={() => navigate(viewAllPath)} aria-label={`Xem tất cả ${title}`}>Xem tất cả <ArrowRight /></button>
      </div>
      <div className="mobile-movie-rail__track" data-testid="mobile-movie-rail">
        {movies.map((movie, index) => (
          <div className="mobile-movie-rail__card" key={movie._id || movie.id || index}>
            <MovieCard movie={movie} hydrateRuntime={false} />
          </div>
        ))}
      </div>
    </section>
  );
};

export default MobileMovieRail;

