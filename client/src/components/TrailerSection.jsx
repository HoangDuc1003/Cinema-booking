import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Film, Play, Star } from 'lucide-react';
import BlurCircle from './BlurCircle';
import Loading from './Loading';
import { useHomeData } from '../context/HomeDataContext';
import { fetchHomeTrailers } from '../services/tmdb';
import { useMediaQuery } from './hero/useHeroEnvironment';

const MAX_TRAILER_CANDIDATES = 10;
const EMPTY_MOVIES = Object.freeze([]);

const movieIdFor = (movie) => {
  const value = String(movie?._id || movie?.id || '').trim();
  return /^\d+$/.test(value) ? value : '';
};

const mergeCandidateMovies = ({ featuredMovie, heroMovies, nowShowingMovies }) => {
  const seen = new Set();
  const merged = [];
  for (const movie of [...nowShowingMovies, ...heroMovies]) {
    const movieId = movieIdFor(movie);
    if (!movieId || seen.has(movieId)) continue;
    seen.add(movieId);
    merged.push(movie);
    if (merged.length >= MAX_TRAILER_CANDIDATES) break;
  }

  const featuredId = movieIdFor(featuredMovie);
  if (!featuredId) return merged;
  const existingIndex = merged.findIndex((movie) => movieIdFor(movie) === featuredId);
  if (existingIndex >= 0) {
    return [merged[existingIndex], ...merged.filter((_, index) => index !== existingIndex)];
  }
  return [featuredMovie, ...merged].slice(0, MAX_TRAILER_CANDIDATES);
};

const imageFor = (movie) => (
  movie?.backdrop_path || movie?.poster_path || movie?.heroImageUrl || ''
);

const TrailerUnavailable = ({ movie, allUnavailable = false }) => (
  <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl">
    {imageFor(movie) && (
      <img
        src={imageFor(movie)}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-30"
      />
    )}
    <div className="relative z-10 mx-6 max-w-md rounded-2xl border border-white/10 bg-black/75 px-6 py-8 text-center backdrop-blur-md">
      <Film className="mx-auto h-11 w-11 text-rose-400" aria-hidden="true" />
      <h3 className="mt-3 text-lg font-semibold text-white">
        {allUnavailable ? 'Trailers are currently unavailable' : 'Trailer unavailable for this movie'}
      </h3>
      <p className="mt-2 text-sm text-gray-300">
        {allUnavailable
          ? 'No verified YouTube trailer is available for the current selection.'
          : 'Choose another movie below to keep browsing trailers.'}
      </p>
    </div>
  </div>
);

const TrailerSection = ({ featuredMovie = null, sectionId = 'home-trailer-section' }) => {
  const { hero, heroStatus, nowShowing, nowShowingStatus } = useHomeData();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const railRef = useRef(null);
  const [selection, setSelection] = useState({ movieId: null, featuredId: null });
  const [requestState, setRequestState] = useState({
    key: '',
    status: 'idle',
    trailers: [],
    error: null,
  });

  const heroMovies = Array.isArray(hero?.movies) ? hero.movies : EMPTY_MOVIES;
  const candidates = useMemo(() => mergeCandidateMovies({
    featuredMovie,
    heroMovies,
    nowShowingMovies: Array.isArray(nowShowing) ? nowShowing : [],
  }), [featuredMovie, heroMovies, nowShowing]);
  const candidateIds = useMemo(() => candidates.map(movieIdFor).filter(Boolean), [candidates]);
  const requestKey = candidateIds.join(',');
  const sourcesSettled = !['idle', 'loading'].includes(nowShowingStatus)
    && (nowShowing.length >= MAX_TRAILER_CANDIDATES || !['idle', 'loading'].includes(heroStatus));

  useEffect(() => {
    if (!sourcesSettled || !requestKey) return undefined;
    const controller = new AbortController();
    let alive = true;

    fetchHomeTrailers({ movieIds: candidateIds, signal: controller.signal }).then((result) => {
      if (!alive || controller.signal.aborted) return;
      setRequestState({
        key: requestKey,
        status: 'success',
        trailers: result.trailers,
        error: null,
      });
    }).catch((error) => {
      if (!alive || controller.signal.aborted || error?.name === 'AbortError') return;
      setRequestState({ key: requestKey, status: 'error', trailers: [], error });
    });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [candidateIds, requestKey, sourcesSettled]);

  const resolvedByMovie = useMemo(() => new Map(
    (requestState.key === requestKey ? requestState.trailers : [])
      .map((trailer) => [trailer.movieId, trailer]),
  ), [requestKey, requestState.key, requestState.trailers]);
  const items = useMemo(() => candidates.map((movie) => ({
    movie,
    movieId: movieIdFor(movie),
    trailer: resolvedByMovie.get(movieIdFor(movie)) || null,
  })), [candidates, resolvedByMovie]);

  const featuredId = movieIdFor(featuredMovie);
  const selectedMovieId = selection.featuredId === featuredId
    ? selection.movieId
    : featuredId;
  const selectedIndex = Math.max(0, items.findIndex((item) => item.movieId === selectedMovieId));
  const current = items[selectedIndex] || items[0] || null;
  const availableCount = items.filter((item) => item.trailer?.available).length;
  const loading = !sourcesSettled || (requestKey && requestState.key !== requestKey);
  const allUnavailable = !loading && items.length > 0 && availableCount === 0;

  const selectMovie = (movieId) => {
    setSelection({ movieId, featuredId });
  };

  const scrollRail = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction * Math.max(220, rail.clientWidth * 0.72),
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <section
      id={sectionId}
      aria-labelledby={`${sectionId}-title`}
      data-trailer-status={loading ? 'loading' : requestState.status}
      className="relative min-h-[70vh] scroll-mt-20 overflow-hidden px-4 py-16 sm:px-6 md:px-16 md:py-20 lg:px-24 xl:px-40"
    >
      <BlurCircle top="220px" right="-60px" delay="0.5s" />
      <BlurCircle top="600px" left="-65px" delay="1s" />

      <div className="relative z-10 mx-auto w-full max-w-[1248px]">
        <h2 id={`${sectionId}-title`} className="mb-8 text-3xl font-bold tracking-wide text-white md:text-4xl lg:text-5xl">
          Trailers
        </h2>

        {loading ? (
          <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5" aria-busy="true">
            <Loading />
          </div>
        ) : !current ? (
          <div className="flex min-h-80 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 px-6 text-center" role="status">
            <div>
              <Film className="mx-auto h-11 w-11 text-rose-400" aria-hidden="true" />
              <p className="mt-3 text-lg font-semibold text-white">Trailer candidates are temporarily unavailable.</p>
              <p className="mt-2 text-sm text-gray-400">Hero and Now Showing remain available independently.</p>
            </div>
          </div>
        ) : current.trailer?.available ? (
          <div className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
            <iframe
              key={current.trailer.key}
              id={`${sectionId}-player`}
              src={`https://www.youtube-nocookie.com/embed/${current.trailer.key}?rel=0&modestbranding=1`}
              title={`${current.movie.title || current.movie.name} ${current.trailer.name || 'trailer'}`}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        ) : (
          <TrailerUnavailable movie={current.movie} allUnavailable={allUnavailable || requestState.status === 'error'} />
        )}

        {requestState.status === 'error' && (
          <p className="mt-4 text-center text-sm text-amber-200" role="status">
            Trailer lookup is temporarily unavailable. You can continue browsing NitroCine.
          </p>
        )}

        {items.length > 0 && (
          <div className="mt-8 flex items-center gap-3">
            <button
              type="button"
              onClick={() => scrollRail(-1)}
              aria-label="Previous trailer cards"
              className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-200 transition hover:border-rose-400/50 hover:bg-rose-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none md:flex"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>

            <div
              ref={railRef}
              className="flex min-w-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Trailer movie selector"
            >
              {items.map((item) => {
                const selected = item.movieId === current?.movieId;
                const title = item.movie.title || item.movie.name || 'Movie';
                const thumbnail = item.trailer?.thumbnailUrl || imageFor(item.movie);
                return (
                  <button
                    key={item.movieId}
                    type="button"
                    onClick={() => selectMovie(item.movieId)}
                    aria-pressed={selected}
                    aria-controls={`${sectionId}-player`}
                    aria-label={`${item.trailer?.available ? 'Play trailer for' : 'Select'} ${title}`}
                    className={`group w-[72%] max-w-64 shrink-0 snap-start overflow-hidden rounded-xl border bg-slate-950 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none sm:w-[42%] md:w-[30%] lg:w-[23%] ${selected ? 'border-rose-400 shadow-lg shadow-rose-500/15' : 'border-white/10 hover:border-rose-400/50'}`}
                  >
                    <span className="relative block aspect-video overflow-hidden bg-black/50">
                      {thumbnail ? (
                        <img src={thumbnail} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-300 group-hover:scale-105 motion-reduce:transition-none" />
                      ) : (
                        <span className="flex h-full items-center justify-center"><Film className="h-8 w-8 text-gray-500" aria-hidden="true" /></span>
                      )}
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25" aria-hidden="true">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/90 text-white shadow-lg">
                          <Play className="h-4 w-4 fill-current" />
                        </span>
                      </span>
                      {item.movie.vote_average > 0 && (
                        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold text-yellow-300">
                          <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                          {Number(item.movie.vote_average).toFixed(1)}
                        </span>
                      )}
                    </span>
                    <span className="block px-3 py-3">
                      <span className="block truncate text-sm font-semibold text-white">{title}</span>
                      <span className="mt-1 block text-xs text-gray-400">
                        {item.trailer?.available
                          ? `${item.trailer.official ? 'Official ' : ''}${item.trailer.type}`
                          : 'Trailer unavailable'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => scrollRail(1)}
              aria-label="Next trailer cards"
              className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-200 transition hover:border-rose-400/50 hover:bg-rose-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none md:flex"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default TrailerSection;
