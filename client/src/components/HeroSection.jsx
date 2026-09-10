import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import HeroContent from './hero/HeroContent';
import HeroMedia from './hero/HeroMedia';
import HeroPosterRail from './hero/HeroPosterRail';
import { buildHeroImageCandidates } from './hero/heroImages';
import {
  HERO_MAX_MOVIES,
  formatRuntime,
  getHeroMovieKey,
  getInitialHeroPayload,
  saveHeroMoviesCache,
  validateMovieCandidates,
} from './hero/heroCatalogLoader';
import { useMediaQuery } from './hero/useHeroEnvironment';
import { useHomeData } from '../context/HomeDataContext';
import './hero/hero.css';

const HERO_POSTER_SWAP_DELAY_MS = 400;
const HERO_POSTER_TRANSITION_MS = 1_200;
const HERO_AUTO_CAROUSEL_MS = 5_000;
const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const isSameMovieOrder = (left, right) => (
  left.length === right.length
  && left.every((movie, index) => (
    getHeroMovieKey(movie, index) === getHeroMovieKey(right[index], index)
  ))
);

const getVietnamDateKey = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const millisecondsUntilNextVietnamDay = (now = new Date()) => {
  const nextMidnight = Date.parse(`${getVietnamDateKey(now)}T17:00:01.000Z`);
  return Math.max(1_000, nextMidnight - now.getTime());
};

const HeroSection = () => {
  const navigate = useNavigate();
  // Aliased to keep Hero's retry visibly distinct from the Now Showing one:
  // the two sections must never share a retry path.
  const { hero: sharedHero, heroStatus, retryHero: retryHomeData } = useHomeData();
  const [initialPayload] = useState(() => getInitialHeroPayload());
  const [movies, setMovies] = useState(initialPayload?.movies || []);
  const [catalogMeta, setCatalogMeta] = useState(initialPayload?.meta || {});
  const [catalogSource, setCatalogSource] = useState(initialPayload ? 'cache' : 'loading');
  const [catalogError, setCatalogError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const moviesRef = useRef(movies);
  const transitionTimersRef = useRef(new Set());
  const isMobileScreen = useMediaQuery('(max-width: 767px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    moviesRef.current = movies;
  }, [movies]);

  const clearTransitionTimers = useCallback(() => {
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    transitionTimersRef.current.clear();
  }, []);

  const switchMovie = useCallback((targetIndex, { animate = true } = {}) => {
    const availableMovies = moviesRef.current;
    if (!availableMovies.length) return;
    const normalizedIndex = ((targetIndex % availableMovies.length) + availableMovies.length) % availableMovies.length;
    const commit = () => setCurrentIndex(normalizedIndex);

    if (!animate || reducedMotion) {
      commit();
      return;
    }

    clearTransitionTimers();
    setIsTransitioning(true);
    const swapTimer = window.setTimeout(() => {
      transitionTimersRef.current.delete(swapTimer);
      commit();
    }, HERO_POSTER_SWAP_DELAY_MS);
    const settleTimer = window.setTimeout(() => {
      transitionTimersRef.current.delete(settleTimer);
      setIsTransitioning(false);
    }, HERO_POSTER_TRANSITION_MS);
    transitionTimersRef.current.add(swapTimer);
    transitionTimersRef.current.add(settleTimer);
  }, [clearTransitionTimers, reducedMotion]);

  useEffect(() => {
    const controller = new AbortController();

    const applyPayload = async () => {
      if (heroStatus === 'loading' || heroStatus === 'idle') {
        if (!moviesRef.current.length) setCatalogSource('loading');
        return;
      }
      if (!sharedHero) {
        if (!moviesRef.current.length) {
          setCatalogSource('error');
          setCatalogError(new Error('Featured movies are temporarily unavailable.'));
        }
        return;
      }

      try {
        const orderedMovies = Array.isArray(sharedHero.movies) ? sharedHero.movies : [];
        if (orderedMovies.length !== HERO_MAX_MOVIES) {
          throw new Error(`Hero API must return exactly ${HERO_MAX_MOVIES} movies.`);
        }
        const preparedMovies = await validateMovieCandidates(orderedMovies, controller.signal);
        if (controller.signal.aborted) return;
        if (preparedMovies.length !== HERO_MAX_MOVIES) {
          throw new Error('Hero returned a movie without usable poster artwork.');
        }

        saveHeroMoviesCache(preparedMovies, {
          source: 'server',
          meta: sharedHero.meta || sharedHero,
          settings: sharedHero.settings,
        });
        setCatalogMeta(sharedHero.meta || sharedHero);
        setCatalogSource('server');
        setCatalogError(null);
        if (!isSameMovieOrder(moviesRef.current, preparedMovies)) {
          clearTransitionTimers();
          setCurrentIndex(0);
        }
        moviesRef.current = preparedMovies;
        setMovies(preparedMovies);
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') return;
        if (!moviesRef.current.length) {
          setCatalogSource('error');
          setCatalogError(error);
        }
      }
    };

    void applyPayload();
    return () => controller.abort();
  }, [clearTransitionTimers, heroStatus, sharedHero]);

  useEffect(() => {
    if (reducedMotion || movies.length < 2) return undefined;
    const interval = window.setInterval(() => {
      switchMovie(currentIndex + 1);
    }, HERO_AUTO_CAROUSEL_MS);
    return () => window.clearInterval(interval);
  }, [currentIndex, movies.length, reducedMotion, switchMovie]);

  useEffect(() => {
    let timer;
    const refreshAtVietnamMidnight = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        retryHomeData();
        refreshAtVietnamMidnight();
      }, millisecondsUntilNextVietnamDay());
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') retryHomeData();
    };

    refreshAtVietnamMidnight();
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [retryHomeData]);

  useEffect(() => () => clearTransitionTimers(), [clearTransitionTimers]);

  if (!movies.length) {
    if (catalogSource === 'error') {
      return (
        <section className="hero-section hero-section--catalog-error" aria-label="Featured movies">
          <div className="hero-catalog-state__backdrop" aria-hidden="true" />
          <div className="hero-catalog-state__error" role="alert">
            <p className="hero-catalog-state__eyebrow">NitroCine</p>
            <h1>Unable to load featured movies</h1>
            <p>{catalogError?.message || 'The server connection was interrupted. Please try again.'}</p>
            <button type="button" onClick={retryHomeData}>
              <RefreshCw aria-hidden="true" />
              Try again
            </button>
          </div>
        </section>
      );
    }
    return <section className="hero-section" aria-label="Loading featured movies" />;
  }

  const currentMovie = movies[currentIndex] || movies[0];
  const currentMovieKey = getHeroMovieKey(currentMovie, currentIndex);
  const desktopImageCandidates = currentMovie.heroImageCandidates?.length
    ? currentMovie.heroImageCandidates
    : buildHeroImageCandidates([
      currentMovie.heroImageUrl,
      currentMovie.backdrop_original,
      currentMovie.backdrop_w1280,
      currentMovie.backdrop_path,
      currentMovie.poster_path,
    ], 'w1280');
  const mobileImageCandidates = currentMovie.heroMobileImageCandidates?.length
    ? currentMovie.heroMobileImageCandidates
    : buildHeroImageCandidates([
      currentMovie.heroMobileImageUrl,
      currentMovie.poster_path,
      currentMovie.heroImageUrl,
      currentMovie.backdrop_original,
      currentMovie.backdrop_path,
    ], 'w780');
  const posterCandidates = isMobileScreen ? mobileImageCandidates : desktopImageCandidates;
  const navigateToMovie = () => {
    navigate(`/movies/${currentMovie._id || currentMovie.id}`);
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <section
      className="hero-section"
      aria-label="Featured movie"
      data-catalog-source={catalogSource}
      data-catalog-version={catalogMeta?.version || ''}
      data-hero-media="poster"
    >
      <HeroMedia
        key={`media-${currentMovieKey}-${posterCandidates.join('|')}`}
        title={currentMovie.title || currentMovie.name}
        posterCandidates={posterCandidates}
        posterVisible
      />

      {isTransitioning && (
        <>
          <div className="hero-transition-dip" aria-hidden="true" />
          <div className="hero-transition-flare" aria-hidden="true" />
        </>
      )}

      <HeroContent
        movieKey={currentMovieKey}
        generation={currentIndex}
        index={currentIndex}
        movie={currentMovie}
        year={currentMovie.release_date?.slice(0, 4) || 'N/A'}
        runtime={formatRuntime(currentMovie.runtime)}
        rating={Number.isFinite(currentMovie.vote_average) ? currentMovie.vote_average.toFixed(1) : 'N/A'}
        onBook={navigateToMovie}
        onDetails={navigateToMovie}
      />

      <HeroPosterRail
        movies={movies}
        currentIndex={currentIndex}
        getThumbnailUrls={(movie) => buildHeroImageCandidates([
          movie.heroImageUrl,
          movie.backdrop_path,
          movie.poster_path,
        ], 'w300')}
        onSelect={(index) => switchMovie(index)}
      />
    </section>
  );
};

export default HeroSection;
