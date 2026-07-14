import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchHomeHero, fetchMovieTrailers } from '../services/tmdb';
import { dummyShowsData } from '../assets/assets';
import Loading from './Loading';
import HeroContent from './hero/HeroContent';
import HeroMedia from './hero/HeroMedia';
import HeroPosterRail from './hero/HeroPosterRail';
import HeroVideoRenderer from './hero/HeroVideoRenderer';
import { buildHeroImageCandidates } from './hero/heroImages';
import {
  HERO_NATIVE_MOCK_FIXTURES,
  isHeroTrailerMockEnabled,
  resolveConfiguredHeroVideoSource,
  resolveHeroVideoSource,
  resolveHeroMockTrailers,
} from './hero/heroMock';
import {
  HERO_FAILURE_REASONS,
  HERO_PHASES,
  HERO_PLAYBACK_STATUS,
  createInitialHeroState,
  getPlaybackRemaining,
  heroReducer,
} from './hero/heroMachine';
import './hero/hero.css';

const VIDEO_ENTER_DURATION_MS = 850;
const RECOMPACT_DELAY_MS = 3_000;
const HERO_POSTER_SWAP_DELAY_MS = 400;
const HERO_POSTER_TRANSITION_MS = 1_200;

const getNow = () => performance.now();

const getHeroMovieKey = (movie, fallback = '') => String(movie?.id || movie?._id || fallback);

const formatRuntime = (minutes) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
};

const canLoadImage = (url, signal, timeoutMs = 6_000) => new Promise((resolve) => {
  if (!url || signal?.aborted) {
    resolve(false);
    return;
  }

  const image = new Image();
  let settled = false;
  let timeoutId;
  const cleanup = () => {
    window.clearTimeout(timeoutId);
    image.onload = null;
    image.onerror = null;
    signal?.removeEventListener('abort', handleAbort);
  };
  const finish = (loaded) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolve(loaded);
  };
  const handleAbort = () => {
    finish(false);
  };

  image.onload = () => {
    finish(image.naturalWidth > 0 && image.naturalHeight > 0);
  };
  image.onerror = () => {
    finish(false);
  };
  signal?.addEventListener('abort', handleAbort, { once: true });
  timeoutId = window.setTimeout(() => finish(false), timeoutMs);
  image.src = url;
});

const validateMovieCandidates = async (movies, signal) => {
  const findFirstLoadable = async (candidates) => {
    for (const url of candidates) {
      if (signal?.aborted) return '';
      if (await canLoadImage(url, signal)) return url;
    }
    return '';
  };

  const putFirst = (candidates, selected) => (
    selected ? [selected, ...candidates.filter((candidate) => candidate !== selected)] : candidates
  );

  const validateMovie = async (movie) => {
    const desktopCandidates = buildHeroImageCandidates([
      movie.backdrop_original,
      movie.backdrop_w1280,
      movie.backdrop_path,
      movie.poster_path,
    ], 'w1280');
    const mobileCandidates = buildHeroImageCandidates([
      movie.poster_path,
      movie.backdrop_original,
      movie.backdrop_w1280,
      movie.backdrop_path,
    ], 'w780');

    const [heroImageUrl, heroMobileImageUrl] = await Promise.all([
      findFirstLoadable(desktopCandidates),
      findFirstLoadable(mobileCandidates),
    ]);
    const fallbackUrl = heroImageUrl || heroMobileImageUrl;
    if (!fallbackUrl) return null;

    return {
      ...movie,
      heroImageUrl: heroImageUrl || fallbackUrl,
      heroMobileImageUrl: heroMobileImageUrl || fallbackUrl,
      heroImageCandidates: putFirst(desktopCandidates, heroImageUrl || fallbackUrl),
      heroMobileImageCandidates: putFirst(mobileCandidates, heroMobileImageUrl || fallbackUrl),
    };
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

const HeroSection = () => {
  const navigate = useNavigate();
  const initialMovies = dummyShowsData.slice(0, 5);
  const [movies, setMovies] = useState(initialMovies);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [manualPlaybackRequested, setManualPlaybackRequested] = useState(false);
  const [muted, setMuted] = useState(true);
  const [heroVisible, setHeroVisible] = useState(() => typeof IntersectionObserver === 'undefined');
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
  const metadataRequestsRef = useRef(new Map());
  const attemptLockRef = useRef(null);
  const autoAttemptedKeysRef = useRef(new Set());
  const transitionLockRef = useRef(false);
  const transitionTimersRef = useRef(new Set());
  const playbackTimersRef = useRef(new Set());
  const carouselIntervalRef = useRef(null);
  const recompactTimerRef = useRef(null);
  const previewHandledGenerationRef = useRef(null);

  const isLargeScreen = useMediaQuery('(min-width: 1024px)');
  const isMobileScreen = useMediaQuery('(max-width: 767px)');
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

  const abortMetadataRequests = useCallback(() => {
    metadataRequestsRef.current.forEach(({ controller }) => controller.abort());
    metadataRequestsRef.current.clear();
    attemptLockRef.current = null;
  }, []);

  const loadHeroVideoSource = useCallback((targetMovie, targetKey, { force = false } = {}) => {
    if (force) {
      trailerCacheRef.current.delete(targetKey);
      metadataRequestsRef.current.get(targetKey)?.controller.abort();
      metadataRequestsRef.current.delete(targetKey);
    }

    const cachedSource = trailerCacheRef.current.get(targetKey);
    if (cachedSource) return Promise.resolve(cachedSource);

    const configuredSource = resolveConfiguredHeroVideoSource(targetMovie);
    if (configuredSource) {
      trailerCacheRef.current.set(targetKey, configuredSource);
      return Promise.resolve(configuredSource);
    }

    const inFlight = metadataRequestsRef.current.get(targetKey);
    if (inFlight) return inFlight.promise;

    const controller = new AbortController();
    const request = (async () => {
      let trailers = [];
      try {
        trailers = await fetchMovieTrailers(targetMovie, { signal: controller.signal });
      } catch (error) {
        if (!heroTrailerMockEnabled || controller.signal.aborted) throw error;
      }
      let resolvedSource = trailers.map(resolveHeroVideoSource).find(Boolean) || null;

      if (!resolvedSource && heroTrailerMockEnabled) {
        resolvedSource = resolveHeroMockTrailers({
          movieKey: targetKey,
          movie: targetMovie,
          fixtures: HERO_NATIVE_MOCK_FIXTURES,
        }).map(resolveHeroVideoSource).find(Boolean) || null;
      }

      if (resolvedSource) trailerCacheRef.current.set(targetKey, resolvedSource);
      return resolvedSource;
    })().finally(() => {
      const currentRequest = metadataRequestsRef.current.get(targetKey);
      if (currentRequest?.controller === controller) metadataRequestsRef.current.delete(targetKey);
    });

    metadataRequestsRef.current.set(targetKey, { controller, promise: request });
    return request;
  }, [heroTrailerMockEnabled]);

  const startTrailerAttempt = useCallback(async ({ source = 'manual', forceMetadata = false } = {}) => {
    if (attemptLockRef.current) return;
    const targetMovie = moviesRef.current[currentIndexRef.current];
    if (!targetMovie) return;

    const targetKey = getHeroMovieKey(targetMovie, currentIndexRef.current);
    const currentMachine = machineRef.current;
    const retrying = currentMachine.phase === HERO_PHASES.TRAILER_FAILED;
    const retryCount = source === 'manual' && retrying
      ? currentMachine.retryCount + 1
      : currentMachine.retryCount;

    window.clearInterval(carouselIntervalRef.current);
    carouselIntervalRef.current = null;
    if (source !== 'auto') setManualPlaybackRequested(true);
    setMuted(true);

    const generation = nextGeneration();
    attemptLockRef.current = { generation, movieKey: targetKey };
    dispatch({
      type: 'TRAILER_REQUESTED',
      generation,
      movieKey: targetKey,
      retryCount,
    });

    try {
      const videoSource = await loadHeroVideoSource(targetMovie, targetKey, {
        force: forceMetadata || retrying,
      });
      if (!mountedRef.current || generation !== generationRef.current) return;

      if (!videoSource) {
        attemptLockRef.current = null;
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
      if (attemptLockRef.current?.generation === generation) attemptLockRef.current = null;
      if (error?.name === 'AbortError' || generation !== generationRef.current) return;
      if (source === 'auto') setManualPlaybackRequested(false);
      dispatch({
        type: 'TRAILER_FAILED',
        generation,
        reason: error?.name === 'TimeoutError' || error?.code === 'ETIMEDOUT' || /timed out/i.test(error?.message || '')
          ? HERO_FAILURE_REASONS.TIMEOUT
          : HERO_FAILURE_REASONS.VIDEO_ERROR,
        detail: { message: error?.message },
        retryCount,
        now: getNow(),
      });
    }
  }, [loadHeroVideoSource, nextGeneration]);

  const resetToPoster = useCallback((movieKey = machineRef.current.movieKey) => {
    abortMetadataRequests();
    clearPlaybackTimers();
    window.clearTimeout(recompactTimerRef.current);
    recompactTimerRef.current = null;
    setManualPlaybackRequested(false);
    setMuted(true);
    const generation = nextGeneration();
    dispatch({ type: 'POSTER_REQUESTED', generation, movieKey });
  }, [abortMetadataRequests, clearPlaybackTimers, nextGeneration]);

  const switchMovie = useCallback((targetIndex, { animate = true, continueTrailer = false } = {}) => {
    const availableMovies = moviesRef.current;
    if (!availableMovies.length || transitionLockRef.current) return;
    const normalizedIndex = ((targetIndex % availableMovies.length) + availableMovies.length) % availableMovies.length;
    if (normalizedIndex === currentIndexRef.current) return;

    abortMetadataRequests();
    clearPlaybackTimers();
    window.clearInterval(carouselIntervalRef.current);
    carouselIntervalRef.current = null;
    window.clearTimeout(recompactTimerRef.current);
    recompactTimerRef.current = null;
    previewHandledGenerationRef.current = null;
    setManualPlaybackRequested(Boolean(continueTrailer));
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
  }, [abortMetadataRequests, clearPlaybackTimers, nextGeneration, reducedMotion]);

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
      abortMetadataRequests();
      clearPlaybackTimers();
      clearTransitionTimers();
      transitionLockRef.current = false;
      window.clearInterval(carouselIntervalRef.current);
      carouselIntervalRef.current = null;
      window.clearTimeout(recompactTimerRef.current);
    };
  }, [abortMetadataRequests, clearPlaybackTimers, clearTransitionTimers]);

  useEffect(() => {
    const controller = new AbortController();
    const applyMovies = (nextMovies) => {
      if (!nextMovies.length) return;
      if (attemptLockRef.current || machineRef.current.phase !== HERO_PHASES.POSTER) return;
      abortMetadataRequests();
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
  }, [abortMetadataRequests, nextGeneration]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      const isVisible = entry.isIntersecting && entry.intersectionRatio > 0.08;
      setHeroVisible(isVisible);
      if (!isVisible) setMuted(true);
    }, { threshold: [0, 0.08, 0.25] });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      setDocumentVisible(isVisible);
      if (!isVisible) setMuted(true);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (heroVisible && documentVisible) return;
    dispatch({ type: 'PLAYBACK_PAUSED', generation: machineRef.current.generation, now: getNow() });
  }, [documentVisible, heroVisible]);

  useEffect(() => {
    if ((!reducedMotion && !saveData) || manualPlaybackRequested) return;
    if (machineRef.current.phase === HERO_PHASES.POSTER) return;
    resetToPoster(getHeroMovieKey(moviesRef.current[currentIndexRef.current], currentIndexRef.current));
  }, [manualPlaybackRequested, reducedMotion, resetToPoster, saveData]);

  const currentMovie = movies[currentIndex];
  const currentMovieKey = getHeroMovieKey(currentMovie, currentIndex);
  const configuredHeroSource = resolveConfiguredHeroVideoSource(currentMovie);
  const heroBackgroundAvailable = Boolean(configuredHeroSource);
  const trailerActive = [
    HERO_PHASES.TRAILER_ENTERING,
    HERO_PHASES.TRAILER_EXPANDED,
    HERO_PHASES.TRAILER_COMPACT,
  ].includes(machine.phase);
  const trailerLoading = machine.phase === HERO_PHASES.TRAILER_LOADING;
  const trailerFailed = machine.phase === HERO_PHASES.TRAILER_FAILED;
  const playbackPhase = trailerLoading || trailerActive;
  const playbackIntent = manualPlaybackRequested || (desktopAutoEligible && heroBackgroundAvailable);
  const playerEnabled = Boolean(
    machine.videoSource
    && playbackIntent
    && playbackPhase
    && heroVisible
    && documentVisible
  );
  const playerActive = playerEnabled && playbackPhase;
  const videoVisible = playerActive && machine.visualReady && !machine.posterVisible;
  const compact = isLargeScreen && !reducedMotion && machine.phase === HERO_PHASES.TRAILER_COMPACT;

  useEffect(() => {
    if (!machine.videoSource || !playbackPhase) return;
    dispatch({
      type: playerEnabled ? 'PLAYER_INITIALIZING' : 'PLAYER_DISABLED',
      generation: machine.generation,
    });
  }, [machine.generation, machine.videoSource, playbackPhase, playerEnabled]);

  useEffect(() => {
    if (
      !currentMovie
      || machine.movieKey !== currentMovieKey
      || machine.phase !== HERO_PHASES.POSTER
      || !heroVisible
      || !documentVisible
    ) return;

    let timerId;
    if (manualPlaybackRequested) {
      timerId = window.setTimeout(() => {
        void startTrailerAttempt({ source: 'continuation' });
      }, 0);
      return () => window.clearTimeout(timerId);
    }

    if (
      !desktopAutoEligible
      || !heroBackgroundAvailable
      || autoAttemptedKeysRef.current.has(currentMovieKey)
    ) return;
    autoAttemptedKeysRef.current.add(currentMovieKey);
    timerId = window.setTimeout(() => {
      void startTrailerAttempt({ source: 'auto' });
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [
    currentMovie,
    currentMovieKey,
    desktopAutoEligible,
    documentVisible,
    heroBackgroundAvailable,
    heroVisible,
    machine.movieKey,
    machine.phase,
    manualPlaybackRequested,
    startTrailerAttempt,
  ]);

  useEffect(() => {
    if (
      machine.playbackStartedAt == null
      || machine.playbackStatus !== HERO_PLAYBACK_STATUS.STABLE
    ) {
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
        if (
          latest.generation !== generation
          || latest.playbackStartedAt == null
          || latest.playbackStatus !== HERO_PLAYBACK_STATUS.STABLE
        ) return;
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
    machine.playbackStatus,
    machine.playbackStartedAt,
    machine.previewRemainingMs,
    isLargeScreen,
    reducedMotion,
  ]);

  useEffect(() => {
    if (
      machine.phase !== HERO_PHASES.TRAILER_ENTERING
      || machine.playbackStatus !== HERO_PLAYBACK_STATUS.STABLE
    ) return undefined;
    const generation = machine.generation;
    const timerId = window.setTimeout(() => {
      dispatch({ type: 'VIDEO_ENTERED', generation });
    }, VIDEO_ENTER_DURATION_MS);
    return () => window.clearTimeout(timerId);
  }, [machine.generation, machine.phase, machine.playbackStatus]);

  useEffect(() => {
    if (
      machine.previewRemainingMs > 0
      || machine.playbackStatus !== HERO_PLAYBACK_STATUS.STABLE
      || previewHandledGenerationRef.current === machine.generation
    ) return;
    previewHandledGenerationRef.current = machine.generation;
    advanceTrailerSequence();
  }, [advanceTrailerSequence, machine.generation, machine.playbackStatus, machine.previewRemainingMs]);

  useEffect(() => {
    if (!movies.length || machine.phase !== HERO_PHASES.POSTER || isTransitioning) {
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
    if (machine.phase === HERO_PHASES.TRAILER_LOADING || attemptLockRef.current) return;
    const activePhase = [
      HERO_PHASES.TRAILER_ENTERING,
      HERO_PHASES.TRAILER_EXPANDED,
      HERO_PHASES.TRAILER_COMPACT,
    ].includes(machine.phase);

    if (activePhase) {
      resetToPoster(currentMovieKey);
      return;
    }

    void startTrailerAttempt({
      source: 'manual',
      forceMetadata: machine.phase === HERO_PHASES.TRAILER_FAILED,
    });
  };

  const handlePlayerFailure = useCallback(({ generation, reason, detail }) => {
    if (generation !== generationRef.current) return;
    abortMetadataRequests();
    clearPlaybackTimers();
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
  }, [abortMetadataRequests, clearPlaybackTimers]);

  const handlePlayerReady = useCallback(({ generation }) => {
    dispatch({ type: 'PLAYER_READY', generation });
  }, []);

  const handlePlaybackRequested = useCallback(({ generation }) => {
    dispatch({ type: 'PLAYBACK_REQUESTED', generation });
  }, []);

  const handlePlaybackPlaying = useCallback(({ generation, now }) => {
    dispatch({ type: 'PLAYBACK_PLAYING', generation, now });
  }, []);

  const handlePlaybackStable = useCallback(({ generation, now }) => {
    if (generation === generationRef.current) attemptLockRef.current = null;
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

  const handleBufferingSustained = useCallback(({ generation, now }) => {
    dispatch({ type: 'BUFFERING_SUSTAINED', generation, now });
  }, []);

  const handleEnded = useCallback(({ generation }) => {
    if (generation !== generationRef.current) return;
    setMuted(true);
    advanceTrailerSequence();
  }, [advanceTrailerSequence]);

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
      currentMovie.backdrop_w1280,
      currentMovie.backdrop_path,
    ], 'w780');
  const posterCandidates = isMobileScreen ? mobileImageCandidates : desktopImageCandidates;
  const navigateToMovie = () => {
    navigate(`/movies/${currentMovie._id || currentMovie.id}`);
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <section ref={rootRef} className="hero-section" aria-label="Featured movie">
      <HeroMedia
        key={`media-${currentMovieKey}-${posterCandidates.join('|')}`}
        title={currentMovie.title || currentMovie.name}
        posterCandidates={posterCandidates}
        posterVisible={machine.posterVisible}
        videoVisible={videoVisible}
      >
        {playerEnabled && (
          <HeroVideoRenderer
            key={`hero-video-${machine.generation}-${machine.videoSource.kind}`}
            enabled={playerEnabled}
            active={playerActive}
            visible={videoVisible}
            source={machine.videoSource}
            generation={machine.generation}
            muted={muted}
            onPlayerReady={handlePlayerReady}
            onPlaybackRequested={handlePlaybackRequested}
            onPlaybackPlaying={handlePlaybackPlaying}
            onPlaybackStable={handlePlaybackStable}
            onVisualReady={handleVisualReady}
            onVisualHidden={handleVisualHidden}
            onPlaybackPaused={handlePlaybackPaused}
            onBufferingSustained={handleBufferingSustained}
            onEnded={handleEnded}
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
        failureReason={machine.failureReason}
        onBook={navigateToMovie}
        onDetails={navigateToMovie}
        onToggleTrailer={handleToggleTrailer}
        showVolumeControl={trailerActive && machine.playbackStatus === HERO_PLAYBACK_STATUS.STABLE}
        muted={muted}
        onToggleMuted={() => setMuted((current) => !current)}
        onReveal={handleReveal}
        onScheduleRecompact={handleScheduleRecompact}
        onCancelRecompact={handleCancelRecompact}
      />

      <HeroPosterRail
        movies={movies}
        currentIndex={currentIndex}
        getThumbnailUrls={(movie) => buildHeroImageCandidates([
          movie.heroImageUrl,
          movie.backdrop_path,
          movie.poster_path,
        ], 'w300')}
        onSelect={(index) => switchMovie(index, {
          animate: true,
          continueTrailer: trailerActive || trailerLoading,
        })}
      />

    </section>
  );
};

export default HeroSection;
