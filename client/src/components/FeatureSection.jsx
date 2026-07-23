import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, StarIcon, Calendar, Clock, Ticket } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import BlurCircle from './BlurCircle';
import { fetchHomeNowShowing } from '../services/tmdb';
import Loading from './Loading';
import MovieGrid from './MovieGrid';
import timeFormat from '../lib/timeFormat';

const getImageUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http')) return path.replace('/t/p/original/', '/t/p/w500/');
  return `https://image.tmdb.org/t/p/w500${path}`;
};

const MobileCarouselCard = ({ movie }) => {
  const navigate = useNavigate();
  const movieId = movie._id || movie.id;
  const movieHref = `/movies/${movieId}`;

  const releaseYear = movie.release_date ? new Date(movie.release_date).getFullYear() : '2026';
  const ratingValue = Number(movie.vote_average ?? movie.rating);
  const rating = Number.isFinite(ratingValue) && ratingValue > 0 ? ratingValue.toFixed(1) : '8.5';
  const runtime = movie.runtime || movie.duration ? timeFormat(movie.runtime || movie.duration) : '2h 15m';

  const posterSrc = getImageUrl(movie.poster_path || movie.backdrop_path || movie.poster);

  const handleNavigate = () => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <article className="group relative flex-shrink-0 w-[190px] rounded-2xl overflow-hidden bg-black/40 border border-white/10 shadow-lg select-none">
      <Link to={movieHref} onClick={handleNavigate} className="block relative aspect-[2/3] w-full overflow-hidden">
        <img
          src={posterSrc}
          alt={movie.title || movie.name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-[11px] font-bold text-yellow-400">
          <StarIcon className="w-3 h-3 fill-yellow-400 text-yellow-400" />
          <span>{rating}</span>
        </div>

        <div className="absolute inset-0 z-20 flex flex-col justify-end p-3 bg-gradient-to-t from-black/95 via-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <h3 className="text-sm font-bold text-white line-clamp-1 mb-1">{movie.title || movie.name}</h3>

          <div className="flex items-center gap-2 text-[10px] text-gray-300 font-medium mb-2.5">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{releaseYear}</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{runtime}</span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              handleNavigate();
              navigate(movieHref);
            }}
            className="w-full flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-primary text-white text-[11px] font-bold shadow-md active:scale-95"
          >
            <Ticket className="w-3 h-3" />
            Book Now
          </button>
        </div>
      </Link>

      <div className="p-2.5 bg-white/[0.03] border-t border-white/5 group-hover:opacity-0 transition-opacity duration-300">
        <h4 className="text-xs font-semibold text-white truncate">{movie.title || movie.name}</h4>
        <div className="flex items-center justify-between text-[10px] text-gray-400 mt-0.5">
          <span>{releaseYear}</span>
          <span className="text-primary font-medium">{movie.genres?.[0]?.name || 'Cinematic'}</span>
        </div>
      </div>
    </article>
  );
};

const FeatureSection = () => {
  const navigate = useNavigate();
  const [movies, setMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);
  const railRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const loadMovies = async () => {
      try {
        const data = await fetchHomeNowShowing({ limit: 10 });
        if (mounted) {
          setMovies(Array.isArray(data) ? data.slice(0, 10) : []);
        }
      } catch (e) {
        console.error('FeatureSection load error', e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    loadMovies();
    return () => { mounted = false; };
  }, []);

  const handleScroll = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) {
      setScrollProgress(100);
      return;
    }
    const current = Math.min(100, Math.max(0, (el.scrollLeft / maxScroll) * 100));
    setScrollProgress(current);
  }, []);

  const handleNavigate = () => {
    navigate('/movies');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section
      className="home-now-showing px-4 sm:px-6 md:px-16 lg:px-24 xl:px-40 overflow-hidden"
      aria-labelledby="home-now-showing-title"
    >
      {/* Header */}
      <div className="relative flex items-center justify-between pt-10 sm:pt-5 pb-6 sm:pb-10">
        <BlurCircle top="80px" right="-60px" />
        <BlurCircle top="600px" left="-65px" />
        <BlurCircle top="800px" right="-100px" />
        <BlurCircle top="0px" left="0" />
        <h2 id="home-now-showing-title" className="relative text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 mt-8 sm:mt-20">
          Now Showing
        </h2>
        <button
          onClick={handleNavigate}
          className="group flex items-center gap-2 px-4 py-2 sm:px-6 sm:py-3 text-[10px] sm:text-sm text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/20 hover:border-primary/40 rounded-full backdrop-blur-sm transition-all duration-300 hover:scale-105 relative overflow-hidden mt-8 sm:mt-20 cursor-pointer"
        >
          View All
          <ArrowRightIcon className="group-hover:translate-x-0.5 transition w-4 h-4 sm:w-4.5 sm:h-4.5" />
        </button>
      </div>

      {isLoading && !movies.length ? (
        <Loading />
      ) : movies.length ? (
        <>
          {/* MOBILE ONLY: Horizontal Carousel Rail */}
          <div className="block sm:hidden relative">
            <div
              ref={railRef}
              onScroll={handleScroll}
              className="flex items-center gap-3 overflow-x-auto scroll-smooth py-2 px-1 no-scrollbar"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {movies.map((movie) => (
                <MobileCarouselCard key={movie._id || movie.id} movie={movie} />
              ))}
            </div>
            {/* Mobile Scroll Indicator */}
            <div className="mt-4 flex items-center justify-center">
              <div className="w-28 h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(20, scrollProgress)}%` }}
                />
              </div>
            </div>
          </div>

          {/* DESKTOP ONLY: Original 5-column MovieGrid */}
          <div className="hidden sm:block">
            <MovieGrid
              movies={movies}
              columns="grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
              animated={true}
              staggerDelay={80}
            />
          </div>
        </>
      ) : (
        <p className="rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center text-sm text-gray-400">
          Current releases are temporarily unavailable. Please try again shortly.
        </p>
      )}

      {/* Desktop Show More Button */}
      <div className="hidden sm:flex justify-center mt-20">
        <button
          onClick={handleNavigate}
          className="group flex items-center gap-3 px-12 py-6 bg-linear-to-r from-primary to-primary-dull hover:from-primary-dull hover:to-primary text-white font-semibold rounded-full shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 border border-primary/30 hover:border-primary/60 relative overflow-hidden mb-5 cursor-pointer"
        >
          Show more
        </button>
      </div>
    </section>
  );
};

export default FeatureSection;
