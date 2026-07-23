import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, StarIcon, Calendar, Clock, Ticket } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import BlurCircle from './BlurCircle';
import { fetchHomeNowShowing } from '../services/tmdb';
import Loading from './Loading';
import timeFormat from '../lib/timeFormat';

const getImageUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http')) return path.replace('/t/p/original/', '/t/p/w500/');
  return `https://image.tmdb.org/t/p/w500${path}`;
};

const CarouselCard = ({ movie }) => {
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
    <article className="group relative flex-shrink-0 w-[200px] sm:w-[240px] md:w-[260px] rounded-2xl overflow-hidden bg-black/40 border border-white/10 shadow-lg hover:shadow-2xl hover:shadow-primary/20 transition-all duration-500 hover:-translate-y-2 select-none">
      <Link to={movieHref} onClick={handleNavigate} className="block relative aspect-[2/3] w-full overflow-hidden">
        <img
          src={posterSrc}
          alt={movie.title || movie.name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />

        {/* Floating Rating Badge */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-xs font-bold text-yellow-400 shadow-md">
          <StarIcon className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
          <span>{rating}</span>
        </div>

        {/* Hover / Tap Details Overlay */}
        <div className="absolute inset-0 z-20 flex flex-col justify-end p-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <h3 className="text-base sm:text-lg font-bold text-white line-clamp-1 mb-1 group-hover:text-primary transition-colors">
            {movie.title || movie.name}
          </h3>

          {movie.genres?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {movie.genres.slice(0, 2).map((g) => (
                <span key={g.id || g.name} className="px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-semibold text-gray-200 uppercase tracking-wider">
                  {g.name}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 text-xs text-gray-300 font-medium mb-3">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{releaseYear}</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{runtime}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                handleNavigate();
                navigate(movieHref);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-primary hover:bg-primary-dull text-white text-xs font-bold transition-all shadow-md shadow-primary/30 active:scale-95"
            >
              <Ticket className="w-3.5 h-3.5" />
              Book Now
            </button>
          </div>
        </div>
      </Link>

      {/* Card Footer Title (visible when not hovered) */}
      <div className="p-3 bg-white/[0.03] border-t border-white/5 group-hover:opacity-0 transition-opacity duration-300">
        <h4 className="text-sm font-semibold text-white truncate">{movie.title || movie.name}</h4>
        <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
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
        const data = await fetchHomeNowShowing({ limit: 12 });
        if (mounted) {
          setMovies(Array.isArray(data) ? data : []);
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

  const scrollRail = (direction) => {
    const el = railRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.75;
    el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  };

  const handleViewAll = () => {
    navigate('/movies');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section
      className="home-now-showing relative px-4 sm:px-6 md:px-16 lg:px-24 xl:px-32 py-12 overflow-hidden"
      aria-labelledby="home-now-showing-title"
    >
      {/* Background Ambience */}
      <BlurCircle top="20px" right="-40px" />
      <BlurCircle top="300px" left="-50px" />

      {/* Section Header */}
      <div className="relative flex items-end justify-between mb-8 sm:mb-10">
        <div>
          <span className="text-xs uppercase tracking-widest text-primary font-bold">In Theaters</span>
          <h2 id="home-now-showing-title" className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight mt-1">
            Now Showing
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Desktop Rail Controls */}
          <div className="hidden sm:flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrollRail('left')}
              className="p-2.5 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 hover:border-primary/50 text-white transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer"
              aria-label="Scroll left"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => scrollRail('right')}
              className="p-2.5 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 hover:border-primary/50 text-white transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer"
              aria-label="Scroll right"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={handleViewAll}
            className="group flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-semibold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/15 hover:border-primary/50 rounded-full backdrop-blur-md transition-all duration-300 hover:scale-105 cursor-pointer"
          >
            View All
            <ArrowRightIcon className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>

      {/* Content State */}
      {isLoading && !movies.length ? (
        <Loading />
      ) : movies.length ? (
        <div className="relative group">
          {/* Horizontal Scrollable Carousel Rail */}
          <div
            ref={railRef}
            onScroll={handleScroll}
            className="flex items-center gap-4 sm:gap-6 overflow-x-auto scroll-smooth py-4 px-1 no-scrollbar cursor-grab active:cursor-grabbing"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {movies.map((movie) => (
              <CarouselCard key={movie._id || movie.id} movie={movie} />
            ))}
          </div>

          {/* Progress Indicator Bar */}
          <div className="mt-6 flex items-center justify-center">
            <div className="w-36 sm:w-48 h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(15, scrollProgress)}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center text-sm text-gray-400">
          Current releases are temporarily unavailable. Please try again shortly.
        </p>
      )}
    </section>
  );
};

export default FeatureSection;
