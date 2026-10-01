import React, { useRef, useCallback, useEffect } from 'react';
import { ArrowRightIcon, StarIcon, Calendar, Clock } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import BlurCircle from './BlurCircle';
import { useHomeData } from '../context/HomeDataContext';
import MovieGrid from './MovieGrid';
import Loading from './Loading';
import timeFormat from '../lib/timeFormat';
const getImageUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http')) return path.replace('/t/p/original/', '/t/p/w500/');
  return `https://image.tmdb.org/t/p/w500${path}`;
};

const MobileCarouselCard = ({ movie }) => {
  const movieId = movie._id || movie.id;
  const movieHref = `/movies/${movieId}`;

  // Unknown details are left out: invented placeholders (a "8.5" rating, a
  // "2h 15m" runtime) read as real facts about the movie.
  const releaseYear = movie.release_date ? new Date(movie.release_date).getFullYear() : '';
  const ratingValue = Number(movie.vote_average ?? movie.rating);
  const rating = Number.isFinite(ratingValue) && ratingValue > 0 ? ratingValue.toFixed(1) : '';
  const runtimeMinutes = Number(movie.runtime || movie.duration);
  const runtime = runtimeMinutes > 0 ? timeFormat(runtimeMinutes) : '';

  const posterSrc = getImageUrl(movie.poster_path || movie.backdrop_path || movie.poster);

  const handleNavigate = () => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <article className="group relative flex-shrink-0 w-[42vw] max-w-[190px] snap-start rounded-2xl overflow-hidden bg-black/40 border border-white/10 shadow-lg select-none tap-press">
      <Link to={movieHref} onClick={handleNavigate} className="block relative aspect-[2/3] w-full overflow-hidden">
        <img
          src={posterSrc || undefined}
          alt={movie.title || movie.name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {rating && (
          <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/75 border border-white/15 text-[11px] font-bold text-yellow-400">
            <StarIcon className="w-3 h-3 fill-yellow-400 text-yellow-400" aria-hidden="true" />
            <span>{rating}</span>
          </div>
        )}

        <div className="absolute inset-0 z-20 flex flex-col justify-end p-3 bg-gradient-to-t from-black/95 via-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <h3 className="text-sm font-bold text-white line-clamp-1 mb-1">{movie.title || movie.name}</h3>

          <div className="flex items-center gap-2 text-[10px] text-gray-300 font-medium mb-2.5">
            {releaseYear && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" aria-hidden="true" />{releaseYear}</span>}
            {runtime && <span className="flex items-center gap-1"><Clock className="w-3 h-3" aria-hidden="true" />{runtime}</span>}
          </div>

          <span
            className="w-full flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-primary text-white text-[11px] font-bold shadow-md active:scale-95"
          >
            <ArrowRightIcon className="w-3 h-3" />
            View Details
          </span>
        </div>
      </Link>

      {/* Touch screens have no hover, so the essentials are always shown here. */}
      <div className="p-2.5 bg-white/[0.03] border-t border-white/5 group-hover:opacity-0 transition-opacity duration-300">
        <h4 className="text-[13px] font-semibold text-white truncate">{movie.title || movie.name}</h4>
        <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400 mt-0.5">
          <span className="truncate">{[releaseYear, runtime].filter(Boolean).join(' · ')}</span>
          {movie.genres?.[0]?.name && <span className="shrink-0 text-primary font-medium">{movie.genres[0].name}</span>}
        </div>
      </div>
    </article>
  );
};

const FeatureSection = () => {
  const navigate = useNavigate();
  const { nowShowing, nowShowingStatus, nowShowingSource, retryNowShowing } = useHomeData();
  const railRef = useRef(null);
  const progressRef = useRef(null);
  const progressFrameRef = useRef(0);

  // The indicator is written straight to the DOM once per frame. Keeping it in
  // React state re-rendered the whole section on every scroll event, which is
  // dozens of renders a second while a thumb is flicking the rail.
  const paintProgress = useCallback(() => {
    progressFrameRef.current = 0;
    const el = railRef.current;
    const bar = progressRef.current;
    if (!el || !bar) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const progress = maxScroll <= 0 ? 1 : Math.min(1, Math.max(0, el.scrollLeft / maxScroll));
    bar.style.transform = `scaleX(${Math.max(0.2, progress).toFixed(3)})`;
  }, []);

  const handleScroll = useCallback(() => {
    if (!progressFrameRef.current) progressFrameRef.current = requestAnimationFrame(paintProgress);
  }, [paintProgress]);

  // Cards are sized in vw, so a rotation or resize changes how far the rail
  // can scroll; the indicator is repainted for that too, not only on scroll.
  useEffect(() => {
    paintProgress();
    window.addEventListener('resize', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', handleScroll);
      if (progressFrameRef.current) cancelAnimationFrame(progressFrameRef.current);
      progressFrameRef.current = 0;
    };
  }, [nowShowing, paintProgress, handleScroll]);

  const handleNavigate = () => {
    navigate('/movies');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section
      className="home-now-showing px-4 sm:px-6 md:px-16 lg:px-24 xl:px-40 overflow-hidden"
      aria-labelledby="home-now-showing-title"
      data-catalog-state={nowShowingStatus}
      data-catalog-source={nowShowingSource || 'unavailable'}
    >
      {/* Header */}
      <div className="relative flex items-center justify-between pt-8 sm:pt-5 pb-5 sm:pb-10">
        <BlurCircle top="80px" right="-60px" />
        <BlurCircle top="600px" left="-65px" />
        <BlurCircle top="800px" right="-100px" />
        <BlurCircle top="0px" left="0" />
        <h2 id="home-now-showing-title" className="relative text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 mt-4 sm:mt-20">
          Now Showing
        </h2>
        <button
          onClick={handleNavigate}
          className="group flex min-h-10 items-center gap-2 px-4 py-2 sm:px-6 sm:py-3 text-xs sm:text-sm text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/20 hover:border-primary/40 rounded-full transition-[color,background-color,border-color,scale] duration-300 hover:scale-105 relative overflow-hidden mt-4 sm:mt-20 cursor-pointer tap-press"
        >
          View All
          <ArrowRightIcon className="group-hover:translate-x-0.5 transition w-4 h-4 sm:w-4.5 sm:h-4.5" />
        </button>
      </div>

      {nowShowingStatus === 'loading' && !nowShowing.length ? (
        <Loading />
      ) : nowShowing.length ? (
        <>
          {/* Cached data is displayed silently — no technical reconnect banner */}
          {/* MOBILE ONLY: Horizontal Carousel Rail */}
          <div className="block sm:hidden relative">
            {/* Edge to edge, snapping card by card, and never handing the swipe
                on to the page's back/forward gesture. */}
            <div
              ref={railRef}
              onScroll={handleScroll}
              data-rail="now-showing"
              className="-mx-4 flex items-stretch gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-px-4 px-4 py-2 no-scrollbar"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {nowShowing.map((movie) => (
                <MobileCarouselCard key={movie._id || movie.id} movie={movie} />
              ))}
            </div>
            {/* Mobile Scroll Indicator */}
            <div className="mt-4 flex items-center justify-center">
              <div className="w-28 h-1 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
                <div
                  ref={progressRef}
                  className="h-full w-full origin-left bg-primary"
                  style={{ transform: 'scaleX(0.2)' }}
                />
              </div>
            </div>
          </div>

          {/* DESKTOP ONLY: Original 5-column MovieGrid */}
          <div className="hidden sm:block">
            <MovieGrid
              movies={nowShowing}
              columns="grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
              animated={true}
              staggerDelay={80}
              ctaLabel="View details"
            />
          </div>
        </>
      ) : nowShowingStatus === 'error' ? (
        <div role="alert" className="rounded-2xl border border-red-300/20 bg-red-300/10 px-6 py-10 text-center text-sm text-red-100">
          <p>Current releases are temporarily unavailable.</p>
          <button type="button" onClick={retryNowShowing} className="mt-4 rounded-full border border-red-200/30 px-5 py-2 font-semibold hover:bg-red-200/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-100">
            Retry
          </button>
        </div>
      ) : (
        <p className="rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center text-sm text-gray-400">
          Current releases are temporarily unavailable. Please try again shortly.
        </p>
      )}

      {/* Desktop Show More Button */}
      <div className="hidden sm:flex justify-center mt-[70px] mb-[20px]">
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
