import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Volume2, VolumeX } from 'lucide-react';
import HeroContent from './hero/HeroContent';
import HeroMedia from './hero/HeroMedia';
import HeroPosterRail from './hero/HeroPosterRail';
import HeroTrailerVideo from './hero/HeroTrailerVideo';
import { buildHeroImageCandidates } from './hero/heroImages';
import {
  HERO_MAX_MOVIES,
  formatRuntime,
  getHeroMovieKey,
  getInitialHeroPayload,
  saveHeroMoviesCache,
  validateMovieCandidates,
} from './hero/heroCatalogLoader';
import { useMediaQuery, useSaveData, useSlowNetwork } from './hero/useHeroEnvironment';
import { scrollToTrailer } from '../lib/scrollToTrailer';
import { useHomeData } from '../context/HomeDataContext';
import './hero/hero.css';

const HERO_POSTER_SWAP_DELAY_MS = 400;
const HERO_POSTER_TRANSITION_MS = 1_200;
const HERO_AUTO_CAROUSEL_MS = 5_000;
// A trailer slide moves on after this much playback, so a two-minute trailer
// never parks the Hero on one movie. Shorter trailers simply end first.
const HERO_TRAILER_DWELL_MS = 12_000;
// Slack for a short trailer to finish on its own before the clock steps in, so
// a stream that stalls near the end still cannot freeze the slide.
const HERO_TRAILER_END_GRACE_MS = 2_000;
// The server turns the line-up over every 12 hours, at 00:00 and 12:00 in
// Vietnam (which has no daylight saving time), and says when in nextRefreshAt.
const HERO_ROTATION_MS = 12 * 60 * 60 * 1_000;
const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1_000;
// Just after a turnover the CDN may still serve the old line-up for up to its
// stale window; until the new one arrives, ask again every minute.
const HERO_STALE_WINDOW_MS = 15 * 60 * 1_000;
const HERO_STALE_RETRY_MS = 60_000;

const getRailThumbnailUrls = (movie) => buildHeroImageCandidates([
  movie.heroImageUrl,
  movie.backdrop_path,
  movie.poster_path,
], 'w300');

const isSameMovieOrder = (left, right) => (
  left.length === right.length
  && left.every((movie, index) => (
    getHeroMovieKey(movie, index) === getHeroMovieKey(right[index], index)
  ))
);

const millisecondsUntilHeroRefresh = (nextRefreshAt, now = Date.now()) => {
  const announced = Date.parse(nextRefreshAt || '');
  if (Number.isFinite(announced)) {
    if (announced > now) return announced - now + 1_000;
    if (now - announced < HERO_STALE_WINDOW_MS) return HERO_STALE_RETRY_MS;
  }
  const nextSlot = ((Math.floor((now + VIETNAM_UTC_OFFSET_MS) / HERO_ROTATION_MS) + 1) * HERO_ROTATION_MS)
    - VIETNAM_UTC_OFFSET_MS;
  return nextSlot - now + 1_000;
};

const HeroSection = ({ onTrailerRequest }) => {
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
  const saveData = useSaveData();
  const slowNetwork = useSlowNetwork();
  const sectionRef = useRef(null);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden');
  const [trailerVisible, setTrailerVisible] = useState(false);
  // Length of the trailer on screen, keyed by its element so a new slide never
  // borrows the previous one.
  const [trailerLength, setTrailerLength] = useState({ key: '', ms: 0 });
  const [failedTrailers, setFailedTrailers] = useState(() => new Set());
  // Pointer or keyboard focus on the poster rail holds the carousel still.
  const [railEngaged, setRailEngaged] = useState(false);
  // Time already spent on the current slide, carried across pauses.
  const slideClockRef = useRef({ key: '', elapsed: 0 });
  // Muted until the viewer asks: browsers only autoplay video without sound.
  const [soundOn, setSoundOn] = useState(false);
  // Trailers are skipped where they would cost more than they give: small
  // screens, data saver, very slow networks, and reduced motion.
  const trailersAllowed = !isMobileScreen && !reducedMotion && !saveData && !slowNetwork;

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
    const commit = () => {
      setTrailerVisible(false);
      setCurrentIndex(normalizedIndex);
    };

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

  const currentTrailer = movies[currentIndex]?.trailerVideo;
  const activeTrailer = trailersAllowed && currentTrailer?.src && !failedTrailers.has(currentTrailer.src)
    ? currentTrailer
    : null;
  const trailerKey = activeTrailer
    ? `${getHeroMovieKey(movies[currentIndex], currentIndex)}-${activeTrailer.src}`
    : '';
  const knownTrailerMs = trailerKey && trailerLength.key === trailerKey ? trailerLength.ms : 0;
  const trailerEndsFirst = knownTrailerMs > 0 && knownTrailerMs <= HERO_TRAILER_DWELL_MS;

  // How long this slide stays up. A poster slide gets the carousel interval; a
  // trailer slide plays up to HERO_TRAILER_DWELL_MS, or to its own end when that
  // comes sooner.
  const slideDwellMs = activeTrailer
    ? (trailerEndsFirst ? knownTrailerMs : HERO_TRAILER_DWELL_MS)
    : HERO_AUTO_CAROUSEL_MS;
  const autoAdvance = !reducedMotion && movies.length > 1;
  // The clock only runs while someone can see the slide. A trailer counts from
  // its first painted frame, and one the viewer unmuted plays out in full.
  const slideClockRunning = autoAdvance
    && inView
    && pageVisible
    && !isTransitioning
    && !railEngaged
    && (!activeTrailer || (trailerVisible && !soundOn));
  const slideClockKey = `${currentIndex}:${trailerKey || 'poster'}`;

  useEffect(() => {
    const clock = slideClockRef.current;
    if (clock.key !== slideClockKey) {
      clock.key = slideClockKey;
      clock.elapsed = 0;
    }
    if (!slideClockRunning) return undefined;
    const advanceAfterMs = slideDwellMs + (trailerEndsFirst ? HERO_TRAILER_END_GRACE_MS : 0);
    const startedAt = performance.now();
    const timer = window.setTimeout(() => {
      switchMovie(currentIndex + 1);
    }, Math.max(0, advanceAfterMs - clock.elapsed));
    return () => {
      window.clearTimeout(timer);
      clock.elapsed += performance.now() - startedAt;
    };
  }, [currentIndex, slideClockKey, slideClockRunning, slideDwellMs, switchMovie, trailerEndsFirst]);

  const handleTrailerReady = useCallback((durationSeconds) => {
    const ms = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds * 1_000 : 0;
    setTrailerLength({ key: trailerKey, ms });
  }, [trailerKey]);

  // Trailers pause off screen and in background tabs instead of streaming unseen.
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.4),
      { threshold: [0, 0.4, 1] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [movies.length]);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const markTrailerFailed = useCallback((src) => {
    setTrailerVisible(false);
    setFailedTrailers((previous) => new Set(previous).add(src));
  }, []);

  const nextRefreshAt = catalogMeta?.nextRefreshAt || '';
  useEffect(() => {
    let timer;
    const refreshAtNextRotation = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        retryHomeData();
        refreshAtNextRotation();
      }, millisecondsUntilHeroRefresh(nextRefreshAt));
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') retryHomeData();
    };

    refreshAtNextRotation();
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [nextRefreshAt, retryHomeData]);

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
    return <section className="hero-section" aria-label="Loading featured movies" data-catalog-source={catalogSource} />;
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
  const showTrailer = () => {
    // Hand the Trailer section the movie on screen so it opens that one, rather
    // than whatever happened to be selected down there already.
    onTrailerRequest?.(currentMovie);
    scrollToTrailer({ reducedMotion });
  };

  return (
    <section
      ref={sectionRef}
      className={`hero-section ${trailerVisible ? 'is-trailer-playing' : ''} ${inView ? '' : 'is-offscreen'}`}
      aria-label="Featured movie"
      data-catalog-source={catalogSource}
      data-catalog-version={catalogMeta?.version || ''}
      data-hero-media={trailerVisible ? 'video' : 'poster'}
    >
      <HeroMedia
        key={`media-${currentMovieKey}-${posterCandidates.join('|')}`}
        title={currentMovie.title || currentMovie.name}
        posterCandidates={posterCandidates}
        posterVisible
      >
        {activeTrailer && (
          <HeroTrailerVideo
            key={trailerKey}
            src={activeTrailer.src}
            type={activeTrailer.type}
            zoom={activeTrailer.zoom}
            playing={inView && pageVisible && !isTransitioning}
            muted={!soundOn}
            onVisibleChange={setTrailerVisible}
            onReady={handleTrailerReady}
            onFinish={() => switchMovie(currentIndex + 1)}
            onFail={() => markTrailerFailed(activeTrailer.src)}
            onSoundBlocked={() => setSoundOn(false)}
          />
        )}
      </HeroMedia>

      {activeTrailer && trailerVisible && (
        <button
          type="button"
          onClick={() => setSoundOn((value) => !value)}
          aria-pressed={soundOn}
          aria-label={soundOn ? 'Mute trailer' : 'Unmute trailer'}
          className="hero-sound-toggle trailer-glass-button"
        >
          {soundOn ? <Volume2 className="h-5 w-5" aria-hidden="true" /> : <VolumeX className="h-5 w-5" aria-hidden="true" />}
        </button>
      )}

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
        rating={Number(currentMovie.vote_average) > 0 ? Number(currentMovie.vote_average).toFixed(1) : 'N/A'}
        onBook={navigateToMovie}
        onTrailer={showTrailer}
        onDetails={navigateToMovie}
      />

      <HeroPosterRail
        movies={movies}
        currentIndex={currentIndex}
        getThumbnailUrls={getRailThumbnailUrls}
        onSelect={switchMovie}
        onEngagedChange={setRailEngaged}
        progress={autoAdvance ? {
          key: slideClockKey,
          durationMs: slideDwellMs,
          running: slideClockRunning,
        } : null}
      />
    </section>
  );
};

export default HeroSection;
