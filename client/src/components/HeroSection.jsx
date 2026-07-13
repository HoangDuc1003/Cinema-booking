import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchHomeHero, fetchMovieTrailers } from '../services/tmdb';
import { dummyShowsData } from '../assets/assets';
import Loading from './Loading';
import HeroContent from './hero/HeroContent';
import HeroControls from './hero/HeroControls';
import HeroMedia from './hero/HeroMedia';
import HeroPosterRail from './hero/HeroPosterRail';
import HeroNativeVideo from './hero/HeroNativeVideo';
import {
  HERO_NATIVE_MOCK_FIXTURES,
  isHeroTrailerMockEnabled,
  resolveHeroMockTrailers,
  resolveNativeHeroVideoSource,
} from './hero/heroMock';
import {
  HERO_FAILURE_REASONS,
  HERO_PHASES,
  createInitialHeroState,
  getPlaybackRemaining,
  heroReducer,
} from './hero/heroMachine';
import './hero/hero.css';

const MAX_MANUAL_RETRIES = 2;
const VIDEO_ENTER_DURATION_MS = 850;
const RECOMPACT_DELAY_MS = 3_000;
const HERO_POSTER_SWAP_DELAY_MS = 400;
const HERO_POSTER_TRANSITION_MS = 1_200;

const getNow = () => performance.now();

const getImageUrl = (path, size = 'original') => {
  if (!path) return '';
  if (path.startsWith('http')) {
    return path.replace(/\/t\/p\/(?:original|w\d+)\//, `/t/p/${size}/`);
  }
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

const getHeroMovieKey = (movie, fallback = '') => String(movie?.id || movie?._id || fallback);

const formatRuntime = (minutes) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
};

const canLoadImage = (url, signal) => new Promise((resolve) => {
  if (!url || signal?.aborted) {
    resolve(false);
    return;
  }

  const image = new Image();
  const cleanup = () => {
    image.onload = null;
    image.onerror = null;
    signal?.removeEventListener('abort', handleAbort);
  };
  const handleAbort = () => {
    cleanup();
    resolve(false);
  };

  image.onload = () => {
    cleanup();
    resolve(true);
  };
  image.onerror = () => {
    cleanup();
    resolve(false);
  };
  signal?.addEventListener('abort', handleAbort, { once: true });
  image.src = url;
});

const validateMovieCandidates = async (movies, signal) => {
  const validateMovie = async (movie) => {
    const candidates = [
      movie.backdrop_original,
      movie.backdrop_w1280,
      movie.backdrop_path,
      movie.poster_path,
    ];
    const uniqueUrls = [...new Set(candidates.filter(Boolean).map((path) => getImageUrl(path, 'w1280')))];

    for (const url of uniqueUrls) {
      if (signal?.aborted) return null;
      if (await canLoadImage(url, signal)) return { ...movie, heroImageUrl: url };
    }
    return null;
  };

  const results = await Promise.all(movies.slice(0, 5).map(validateMovie));
  return results.filter(Boolean);
};

const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(query).matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handleChange = (event) => setMatches(event.matches);
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, [query]);

  return matches;
};

const useSaveData = () => {
  const [saveData, setSaveData] = useState(() => Boolean(navigator.connection?.saveData));

  useEffect(() => {
    const connection = navigator.connection;
    if (!connection) return undefined;
    const handleChange = () => setSaveData(Boolean(connection.saveData));
    connection.addEventListener?.('change', handleChange);
    return () => connection.removeEventListener?.('change', handleChange);
  }, []);

  return saveData;
};

const HeroSection = ({ onWatchTrailer }) => {
  const navigate = useNavigate();
  const initialMovies = dummyShowsData.slice(0, 5);
  const [movies, setMovies] = useState(initialMovies);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [manualPlaybackRequested, setManualPlaybackRequested] = useState(false);
  const [muted, setMuted] = useState(true);
  const [heroVisible, setHeroVisible] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(() => !document.hidden);

  const initialMovieKey = getHeroMovieKey(initialMovies[0], 0);
  const [machine, dispatch] = useReducer(
    heroReducer,
    { movieKey: initialMovieKey, generation: 0 },
    createInitialHeroState,
  );

  const rootRef = useRef(null);
  const mountedRef = useRef(false);
  const moviesRef = useRef(movies);
  const currentIndexRef = useRef(currentIndex);
  const machineRef = useRef(machine);
  const generationRef = useRef(machine.generation);
  const trailerCacheRef = useRef(new Map());
  const trailerPromisesRef = useRef(new Map());
  const trailerControllersRef = useRef(new Map());
  const autoAttemptedKeysRef = useRef(new Set());
  const transitionLockRef = useRef(false);
  const transitionTimersRef = useRef(new Set());
  const playbackTimersRef = useRef(new Set());
  const carouselIntervalRef = useRef(null);
  const recompactTimerRef = useRef(null);
  const previewHandledGenerationRef = useRef(null);

  const isLargeScreen = useMediaQuery('(min-width: 1024px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const saveData = useSaveData();
  const desktopAutoEligible = isLargeScreen && !reducedMotion && !saveData;
  const heroTrailerMockEnabled = isHeroTrailerMockEnabled(window.location.search, import.meta.env.DEV);

  useEffect(() => {
    moviesRef.current = movies;
    currentIndexRef.current = currentIndex;
    machineRef.current = machine;
    generationRef.current = Math.max(generationRef.current, machine.generation);
  }, [currentIndex, machine, movies]);

  const nextGeneration = useCallback(() => {
    generationRef.current += 1;
    return generationRef.current;
  }, []);

  const clearPlaybackTimers = useCallback(() => {
    playbackTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    playbackTimersRef.current.clear();
  }, []);

  const clearTransitionTimers = useCallback(() => {
    transitionTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    transitionTimersRef.current.clear();
  }, []);

  const abortTrailerLoads = useCallback(() => {
    trailerControllersRef.current.forEach((controller) => controller.abort());
    trailerControllersRef.current.clear();
    trailerPromisesRef.current.clear();
  }, []);

  const loadHeroTrailers = useCallback((targetMovie, targetKey, { force = false } = {}) => {
    if (force) trailerCacheRef.current.delete(targetKey);
    if (trailerCacheRef.current.has(targetKey)) {
      return Promise.resolve(trailerCacheRef.current.get(targetKey));
    }

    if (heroTrailerMockEnabled) {
      const mockedTrailers = resolveHeroMockTrailers({
        movieKey: targetKey,
        movie: targetMovie,
        fixtures: HERO_NATIVE_MOCK_FIXTURES,
      });
      trailerCacheRef.current.set(targetKey, mockedTrailers);
      return Promise.resolve(mockedTrailers);
    }

    const existingPromise = trailerPromisesRef.current.get(targetKey);
    if (existingPromise) return existingPromise;

    const controller = new AbortController();
    trailerControllersRef.current.set(targetKey, controller);
    const promise = fetchMovieTrailers(targetMovie, { signal: controller.signal })
      .then((trailers) => {
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const normalized = Array.isArray(trailers) ? trailers : [];
        trailerCacheRef.current.set(targetKey, normalized);
        return normalized;
      })
      .finally(() => {
        if (trailerPromisesRef.current.get(targetKey) === promise) {
          trailerPromisesRef.current.delete(targetKey);
        }
        if (trailerControllersRef.current.get(targetKey) === controller) {
          trailerControllersRef.current.delete(targetKey);
        }
      });

    trailerPromisesRef.current.set(targetKey, promise);
    return promise;
  }, [heroTrailerMockEnabled]);

  const startTrailerAttempt = useCallback(async ({ source = 'manual', forceMetadata = false } = {}) => {
    const targetMovie = moviesRef.current[currentIndexRef.current];
    if (!targetMovie) return;

    const targetKey = getHeroMovieKey(targetMovie, currentIndexRef.current);
    const currentMachine = machineRef.current;
    const retrying = currentMachine.phase === HERO_PHASES.TRAILER_FAILED;
    const retryCount = source === 'manual' && retrying
      ? currentMachine.retryCount + 1
      : currentMachine.retryCount;

    if (source === 'manual' && retryCount > MAX_MANUAL_RETRIES) return;

    window.clearInterval(carouselIntervalRef.current);
    carouselIntervalRef.current = null;
    if (source !== 'auto') setManualPlaybackRequested(true);
    setMuted(true);

    const generation = nextGeneration();
    dispatch({
      type: 'TRAILER_REQUESTED',
      generation,
      movieKey: targetKey,
      retryCount,
    });

    try {
      const trailers = await loadHeroTrailers(targetMovie, targetKey, {
        force: forceMetadata || retrying,
      });
      if (!mountedRef.current || generation !== generationRef.current) return;

      const videoSource = trailers
        .map((candidate) => resolveNativeHeroVideoSource(candidate))
        .find(Boolean);
      if (!videoSource) {
        if (source === 'auto') setManualPlaybackRequested(false);
        dispatch({
          type: 'TRAILER_FAILED',
          generation,
          reason: HERO_FAILURE_REASONS.MISSING_VIDEO,
          retryCount,
          now: getNow(),
        });
        return;
      }

      dispatch({ type: 'TRAILER_METADATA_RESOLVED', generation, videoSource });
    } catch (error) {
      if (error?.name === 'AbortError' || generation !== generationRef.current) return;
      if (source === 'auto') setManualPlaybackRequested(false);
      dispatch({
        type: 'TRAILER_FAILED',
        generation,
        reason: /timed out/i.test(error?.message || '')
          ? HERO_FAILURE_REASONS.TIMEOUT
          : HERO_FAILURE_REASONS.VIDEO_ERROR,
        detail: { message: error?.message },
        retryCount,
        now: getNow(),
      });
    }
  }, [loadHeroTrailers, nextGeneration]);

  const resetToPoster = useCallback((movieKey = machineRef.current.movieKey) => {
    clearPlaybackTimers();
    window.clearTimeout(recompactTimerRef.current);
    recompactTimerRef.current = null;
    abortTrailerLoads();
    setManualPlaybackRequested(false);
    setMuted(true);
    const generation = nextGeneration();
    dispatch({ type: 'POSTER_REQUESTED', generation, movieKey });
  }, [abortTrailerLoads, clearPlaybackTimers, nextGeneration]);

  const switchMovie = useCallback((targetIndex, { animate = true, continueTrailer = false } = {}) => {
    const availableMovies = moviesRef.current;
    if (!availableMovies.length || transitionLockRef.current) return;
    const normalizedIndex = ((targetIndex % availableMovies.length) + availableMovies.length) % availableMovies.length;
    if (normalizedIndex === currentIndexRef.current) return;

    clearPlaybackTimers();
    window.clearInterval(carouselIntervalRef.current);
    carouselIntervalRef.current = null;
    abortTrailerLoads();
    window.clearTimeout(recompactTimerRef.current);
    recompactTimerRef.current = null;
    previewHandledGenerationRef.current = null;
    setManualPlaybackRequested(continueTrailer);
    setMuted(true);

    const targetKey = getHeroMovieKey(availableMovies[normalizedIndex], normalizedIndex);
    const generation = nextGeneration();
    dispatch({ type: 'MOVIE_CHANGED', generation, movieKey: targetKey });

    if (!animate || reducedMotion) {
      currentIndexRef.current = normalizedIndex;
      setCurrentIndex(normalizedIndex);
      return;
    }

    transitionLockRef.current = true;
    setIsTransitioning(true);
    const swapTimer = window.setTimeout(() => {
      transitionTimersRef.current.delete(swapTimer);
      currentIndexRef.current = normalizedIndex;
      setCurrentIndex(normalizedIndex);
    }, HERO_POSTER_SWAP_DELAY_MS);
    const settleTimer = window.setTimeout(() => {
      transitionTimersRef.current.delete(settleTimer);
      transitionLockRef.current = false;
      setIsTransitioning(false);
    }, HERO_POSTER_TRANSITION_MS);
    transitionTimersRef.current.add(swapTimer);
    transitionTimersRef.current.add(settleTimer);
  }, [abortTrailerLoads, clearPlaybackTimers, nextGeneration, reducedMotion]);

  const advanceTrailerSequence = useCallback(() => {
    const availableMovies = moviesRef.current;
    if (!availableMovies.length) return;
    const nextIndex = (currentIndexRef.current + 1) % availableMovies.length;
    switchMovie(nextIndex, { animate: false, continueTrailer: true });
  }, [switchMovie]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearPlaybackTimers();
      clearTransitionTimers();
      transitionLockRef.current = false;
      abortTrailerLoads();
      window.clearInterval(carouselIntervalRef.current);
      carouselIntervalRef.current = null;
      window.clearTimeout(recompactTimerRef.current);
    };
  }, [abortTrailerLoads, clearPlaybackTimers, clearTransitionTimers]);

  useEffect(() => {
    const controller = new AbortController();
    const applyMovies = (nextMovies) => {
      if (!nextMovies.length) return;
      const generation = nextGeneration();
      const nextKey = getHeroMovieKey(nextMovies[0], 0);
      currentIndexRef.current = 0;
      moviesRef.current = nextMovies;
      setCurrentIndex(0);
      setManualPlaybackRequested(false);
      setMovies(nextMovies);
      dispatch({ type: 'MOVIE_CHANGED', generation, movieKey: nextKey });
    };

    const loadHero = async () => {
      try {
        const data = await fetchHomeHero({ signal: controller.signal });
        if (controller.signal.aborted) return;
        const rawMovies = Array.isArray(data.movies) && data.movies.length ? data.movies : dummyShowsData;
        const immediateMovies = rawMovies.slice(0, 5);
        applyMovies(immediateMovies);
        const validMovies = await validateMovieCandidates(immediateMovies, controller.signal);
        if (!controller.signal.aborted && validMovies.length) applyMovies(validMovies);
      } catch (error) {
        if (error?.name !== 'AbortError' && import.meta.env.DEV) {
          console.warn('Hero load error:', error.message);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void loadHero();
    return () => controller.abort();
  }, [nextGeneration]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      setHeroVisible(entry.isIntersecting && entry.intersectionRatio > 0.08);
    }, { threshold: [0, 0.08, 0.25] });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => setDocumentVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (heroVisible && documentVisible) return;
    dispatch({ type: 'PLAYBACK_PAUSED', generation: machineRef.current.generation, now: getNow() });
  }, [documentVisible, heroVisible]);

  useEffect(() => {
    if (isLargeScreen) return;
    if (machineRef.current.phase === HERO_PHASES.POSTER && !machineRef.current.videoSource) return;
    resetToPoster(getHeroMovieKey(moviesRef.current[currentIndexRef.current], currentIndexRef.current));
  }, [isLargeScreen, resetToPoster]);

  useEffect(() => {
    if ((!reducedMotion && !saveData) || manualPlaybackRequested) return;
    if (machineRef.current.phase === HERO_PHASES.POSTER) return;
    resetToPoster(getHeroMovieKey(moviesRef.current[currentIndexRef.current], currentIndexRef.current));
  }, [manualPlaybackRequested, reducedMotion, resetToPoster, saveData]);

  const currentMovie = movies[currentIndex];
  const currentMovieKey = getHeroMovieKey(currentMovie, currentIndex);

  useEffect(() => {
    if (!currentMovie || machine.movieKey !== currentMovieKey || machine.phase !== HERO_PHASES.POSTER) return;

    let timerId;
    if (manualPlaybackRequested) {
      timerId = window.setTimeout(() => {
        void startTrailerAttempt({ source: 'continuation' });
      }, 0);
      return () => window.clearTimeout(timerId);
    }

    if (!desktopAutoEligible || autoAttemptedKeysRef.current.has(currentMovieKey)) return;
    autoAttemptedKeysRef.current.add(currentMovieKey);
    timerId = window.setTimeout(() => {
      void startTrailerAttempt({ source: 'auto' });
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [
    currentMovie,
    currentMovieKey,
    desktopAutoEligible,
    machine.movieKey,
    machine.phase,
    manualPlaybackRequested,
    startTrailerAttempt,
  ]);

  useEffect(() => {
    if (machine.playbackStartedAt == null) {
      clearPlaybackTimers();
      return undefined;
    }

    clearPlaybackTimers();
    const generation = machine.generation;

    const scheduleBudget = (kind) => {
      const state = machineRef.current;
      const remaining = getPlaybackRemaining(state, getNow())[kind];
      if (remaining <= 0) {
        dispatch({
          type: kind === 'compactRemainingMs' ? 'COMPACT_ELAPSED' : 'PREVIEW_ELAPSED',
          generation,
          now: getNow(),
        });
        return;
      }

      const timerId = window.setTimeout(() => {
        playbackTimersRef.current.delete(timerId);
        const latest = machineRef.current;
        if (latest.generation !== generation || latest.playbackStartedAt == null) return;
        const nextRemaining = getPlaybackRemaining(latest, getNow())[kind];
        if (nextRemaining > 8) {
          scheduleBudget(kind);
          return;
        }
        dispatch({
          type: kind === 'compactRemainingMs' ? 'COMPACT_ELAPSED' : 'PREVIEW_ELAPSED',
          generation,
          now: getNow(),
        });
      }, remaining);
      playbackTimersRef.current.add(timerId);
    };

    if (isLargeScreen && !reducedMotion && machine.compactRemainingMs > 0 && machine.phase !== HERO_PHASES.TRAILER_COMPACT) {
      scheduleBudget('compactRemainingMs');
    }
    if (machine.previewRemainingMs > 0) scheduleBudget('previewRemainingMs');

    return clearPlaybackTimers;
  }, [
    clearPlaybackTimers,
    machine.compactRemainingMs,
    machine.generation,
    machine.phase,
    machine.playbackStartedAt,
    machine.previewRemainingMs,
    isLargeScreen,
    reducedMotion,
  ]);

  useEffect(() => {
    if (machine.phase !== HERO_PHASES.TRAILER_ENTERING) return undefined;
    const generation = machine.generation;
    const timerId = window.setTimeout(() => {
      dispatch({ type: 'VIDEO_ENTERED', generation });
    }, VIDEO_ENTER_DURATION_MS);
    return () => window.clearTimeout(timerId);
  }, [machine.generation, machine.phase]);

  useEffect(() => {
    if (machine.previewRemainingMs > 0 || previewHandledGenerationRef.current === machine.generation) return;
    previewHandledGenerationRef.current = machine.generation;
    advanceTrailerSequence();
  }, [advanceTrailerSequence, machine.generation, machine.previewRemainingMs]);

  useEffect(() => {
    if (!movies.length || ![HERO_PHASES.POSTER, HERO_PHASES.TRAILER_FAILED].includes(machine.phase) || isTransitioning) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      switchMovie(currentIndexRef.current + 1, { animate: true, continueTrailer: false });
    }, 6_000);
    carouselIntervalRef.current = intervalId;
    return () => {
      window.clearInterval(intervalId);
      if (carouselIntervalRef.current === intervalId) carouselIntervalRef.current = null;
    };
  }, [isTransitioning, machine.phase, movies.length, switchMovie]);

  const handleToggleTrailer = () => {
    const activePhase = [
      HERO_PHASES.TRAILER_LOADING,
      HERO_PHASES.TRAILER_ENTERING,
      HERO_PHASES.TRAILER_EXPANDED,
      HERO_PHASES.TRAILER_COMPACT,
    ].includes(machine.phase);

    if (activePhase) {
      resetToPoster(currentMovieKey);
      return;
    }

    if (machine.phase === HERO_PHASES.TRAILER_FAILED && machine.retryCount >= MAX_MANUAL_RETRIES) return;
    void startTrailerAttempt({
      source: 'manual',
      forceMetadata: machine.phase === HERO_PHASES.TRAILER_FAILED,
    });
  };

  const handlePlayerFailure = useCallback(({ generation, reason, detail }) => {
    if (generation !== generationRef.current) return;
    setManualPlaybackRequested(false);
    setMuted(true);
    dispatch({
      type: 'TRAILER_FAILED',
      generation,
      reason,
      detail,
      retryCount: machineRef.current.retryCount,
      now: getNow(),
    });
  }, []);

  const handlePlaybackResumed = useCallback(({ generation, now }) => {
    dispatch({ type: 'PLAYBACK_RESUMED', generation, now });
  }, []);

  const handlePlaybackStable = useCallback(({ generation, now }) => {
    dispatch({ type: 'PLAYBACK_STABLE', generation, now });
  }, []);

  const handleVisualReady = useCallback(({ generation }) => {
    dispatch({ type: 'VISUAL_READY', generation });
  }, []);

  const handleVisualHidden = useCallback(({ generation }) => {
    dispatch({ type: 'VISUAL_HIDDEN', generation });
  }, []);

  const handlePlaybackPaused = useCallback(({ generation, now }) => {
    dispatch({ type: 'PLAYBACK_PAUSED', generation, now });
  }, []);

  const handleBufferingSustained = useCallback(({ generation }) => {
    dispatch({ type: 'BUFFERING_SUSTAINED', generation });
  }, []);

  const handleReveal = () => {
    if (machine.phase !== HERO_PHASES.TRAILER_COMPACT) return;
    window.clearTimeout(recompactTimerRef.current);
    recompactTimerRef.current = null;
    dispatch({ type: 'REVEAL_OVERVIEW', generation: machine.generation });
  };

  const handleScheduleRecompact = (revealZone) => {
    if (machine.phase !== HERO_PHASES.TRAILER_COMPACT) return;
    window.clearTimeout(recompactTimerRef.current);
    const generation = machine.generation;
    recompactTimerRef.current = window.setTimeout(() => {
      recompactTimerRef.current = null;
      if (revealZone?.contains?.(document.activeElement)) return;
      dispatch({ type: 'HIDE_OVERVIEW', generation });
    }, RECOMPACT_DELAY_MS);
  };

  const handleCancelRecompact = () => {
    window.clearTimeout(recompactTimerRef.current);
    recompactTimerRef.current = null;
  };

  if (isLoading || !currentMovie) {
    return (
      <div className="hero-section flex items-center justify-center">
        <Loading />
      </div>
    );
  }

  const backdropUrl = currentMovie.heroImageUrl
    || getImageUrl(currentMovie.backdrop_original || currentMovie.backdrop_w1280 || currentMovie.backdrop_path, 'w1280');
  const mobilePosterUrl = getImageUrl(currentMovie.poster_path || currentMovie.backdrop_path || backdropUrl, 'w780');
  const trailerActive = [
    HERO_PHASES.TRAILER_ENTERING,
    HERO_PHASES.TRAILER_EXPANDED,
    HERO_PHASES.TRAILER_COMPACT,
  ].includes(machine.phase);
  const trailerLoading = machine.phase === HERO_PHASES.TRAILER_LOADING;
  const trailerFailed = machine.phase === HERO_PHASES.TRAILER_FAILED;
  const retryExhausted = trailerFailed && machine.retryCount >= MAX_MANUAL_RETRIES;
  const playerEnabled = Boolean(
    machine.videoSource?.src
    && (desktopAutoEligible || manualPlaybackRequested)
    && !trailerFailed
  );
  const playerActive = Boolean(
    playerEnabled
    && [
      HERO_PHASES.TRAILER_LOADING,
      HERO_PHASES.TRAILER_ENTERING,
      HERO_PHASES.TRAILER_EXPANDED,
      HERO_PHASES.TRAILER_COMPACT,
    ].includes(machine.phase)
    && heroVisible
    && documentVisible
  );
  const videoVisible = playerActive && !machine.posterVisible;
  const compact = isLargeScreen && !reducedMotion && machine.phase === HERO_PHASES.TRAILER_COMPACT;

  const handlePosterError = () => {
    if (movies.length <= 1) return;
    const stableId = currentMovie.id || currentMovie._id;
    const nextMovies = movies.filter((movie) => (movie.id || movie._id) !== stableId);
    const nextIndex = Math.min(currentIndex, nextMovies.length - 1);
    const nextKey = getHeroMovieKey(nextMovies[nextIndex], nextIndex);
    const generation = nextGeneration();
    moviesRef.current = nextMovies;
    currentIndexRef.current = nextIndex;
    setMovies(nextMovies);
    setCurrentIndex(nextIndex);
    setManualPlaybackRequested(false);
    dispatch({ type: 'MOVIE_CHANGED', generation, movieKey: nextKey });
  };

  const navigateToMovie = () => {
    navigate(`/movies/${currentMovie._id || currentMovie.id}`);
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <section ref={rootRef} className="hero-section" aria-label="Featured movie">
      <HeroMedia
        key={`media-${currentMovieKey}`}
        title={currentMovie.title || currentMovie.name}
        backdropUrl={backdropUrl}
        mobilePosterUrl={mobilePosterUrl}
        posterVisible={machine.posterVisible}
        videoVisible={videoVisible}
        onPosterError={handlePosterError}
      >
        {playerEnabled && (
          <HeroNativeVideo
            key={`hero-video-${machine.generation}`}
            enabled={playerEnabled}
            active={playerActive}
            visible={videoVisible}
            source={machine.videoSource}
            generation={machine.generation}
            muted={muted}
            onPlaybackResumed={handlePlaybackResumed}
            onPlaybackStable={handlePlaybackStable}
            onVisualReady={handleVisualReady}
            onVisualHidden={handleVisualHidden}
            onPlaybackPaused={handlePlaybackPaused}
            onBufferingSustained={handleBufferingSustained}
            onEnded={advanceTrailerSequence}
            onFailure={handlePlayerFailure}
          />
        )}
      </HeroMedia>

      {isTransitioning && machine.posterVisible && (
        <>
          <div className="hero-transition-dip" aria-hidden="true" />
          <div className="hero-transition-flare" aria-hidden="true" />
        </>
      )}

      <HeroContent
        movie={currentMovie}
        year={currentMovie.release_date?.slice(0, 4) || 'N/A'}
        runtime={formatRuntime(currentMovie.runtime)}
        rating={Number.isFinite(currentMovie.vote_average) ? currentMovie.vote_average.toFixed(1) : 'N/A'}
        compact={compact}
        overviewRevealed={machine.overviewRevealed}
        trailerActive={trailerActive}
        trailerLoading={trailerLoading}
        trailerFailed={trailerFailed}
        retryExhausted={retryExhausted}
        failureReason={machine.failureReason}
        onBook={navigateToMovie}
        onDetails={navigateToMovie}
        onToggleTrailer={handleToggleTrailer}
        onWatchTrailer={onWatchTrailer ? () => onWatchTrailer(currentMovie) : undefined}
        onReveal={handleReveal}
        onScheduleRecompact={handleScheduleRecompact}
        onCancelRecompact={handleCancelRecompact}
      />

      <HeroPosterRail
        movies={movies}
        currentIndex={currentIndex}
        getThumbnailUrl={(movie) => movie.heroImageUrl || getImageUrl(movie.backdrop_path || movie.poster_path, 'w300')}
        onSelect={(index) => switchMovie(index, {
          animate: true,
          continueTrailer: trailerActive || trailerLoading,
        })}
      />

      {isLargeScreen && (
        <HeroControls
          trailerActive={trailerActive}
          trailerLoading={trailerLoading}
          trailerFailed={trailerFailed}
          retryExhausted={retryExhausted}
          muted={muted}
          onToggleMuted={() => setMuted((current) => !current)}
          onToggleTrailer={handleToggleTrailer}
        />
      )}
    </section>
  );
};

export default HeroSection;
