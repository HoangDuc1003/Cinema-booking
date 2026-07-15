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
import { useHeroContentDisclosure } from './hero/useHeroContentDisclosure';
import './hero/hero.css';

const VIDEO_ENTER_DURATION_MS = 850;
const HERO_POSTER_SWAP_DELAY_MS = 400;
const HERO_POSTER_TRANSITION_MS = 1_200;
const HERO_AUTO_CAROUSEL_MS = 9_000;
const HERO_MAX_MOVIES = 5;

const HERO_PLAYBACK_INTENT = Object.freeze({
  NONE: 'none',
  AUTO: 'auto',
  MANUAL: 'manual',
  CONTINUATION: 'continuation',
});

const getNow = () => performance.now();

const getHeroMovieKey = (movie, fallback = '') => String(movie?.id || movie?._id || fallback);

const formatRuntime = (minutes) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
};

const selectBestHeroMovies = (movies) => {
  if (!Array.isArray(movies) || !movies.length) return dummyShowsData.slice(0, HERO_MAX_MOVIES);
  const scored = movies.map((m) => {
    const popularity = Number(m.popularity) || 0;
    const voteAverage = Number(m.vote_average) || 0;
    const voteCount = Number(m.vote_count) || 0;
    const hasBackdrop = Boolean(m.backdrop_path || m.backdrop_original);
    const hasNative = Boolean(resolveConfiguredHeroVideoSource(m));
    const releaseYear = Number((m.release_date || '').slice(0, 4)) || 0;
    const isRecent = releaseYear >= new Date().getFullYear() - 1;

    const score = popularity * 0.3
      + voteAverage * 10
      + (voteCount > 100 ? 15 : 0)
      + (hasBackdrop ? 30 : 0)
      + (hasNative ? 50 : 0)
      + (isRecent ? 25 : 0);

    return { movie: m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, HERO_MAX_MOVIES).map((item) => item.movie);
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

  const results = await Promise.all(movies.slice(0, HERO_MAX_MOVIES).map(validateMovie));
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

const HeroSection = ({
  autoPreview = false,
  introComplete = true,
  posterWarmupMs = 0,
}) => {
  const navigate = useNavigate();
  const initialBestMovies = selectBestHeroMovies(dummyShowsData);
  const [movies, setMovies] = useState(initialBestMovies);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [heroCatalogSettled, setHeroCatalogSettled] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [playbackIntent, setPlaybackIntent] = useState(HERO_PLAYBACK_INTENT.NONE);
  const [muted, setMuted] = useState(true);
  const [soundPreferred, setSoundPreferred] = useState(true);
  const [autoplaySoundBlocked, setAutoplaySoundBlocked] = useState(false);
  const [posterWarmupComplete, setPosterWarmupComplete] = useState(() => (
    !autoPreview || (introComplete && posterWarmupMs <= 0)
  ));
  const [revealedGeneration, setRevealedGeneration] = useState(null);
  const [heroVisible, setHeroVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [documentVisible, setDocumentVisible] = useState(() => !document.hidden);

  const initialMovieKey = getHeroMovieKey(initialBestMovies[0], 0);
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
  const trailerPrefetchAttemptedRef = useRef(new Set());
  const attemptLockRef = useRef(null);
  const autoAttemptedKeysRef = useRef(new Set());
  const transitionLockRef = useRef(false);
  const transitionTimersRef = useRef(new Set());
  const playbackTimersRef = useRef(new Set());
  const carouselIntervalRef = useRef(null);
  const pendingVisualReadyRef = useRef(null);

  const isLargeScreen = useMediaQuery('(min-width: 1024px)');
  const isMobileScreen = useMediaQuery('(max-width: 767px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const saveData = useSaveData();
  const automaticPreviewEligible = !reducedMotion
    && !saveData
    && (autoPreview ? !isMobileScreen : isLargeScreen);
  const heroTrailerMockEnabled = isHeroTrailerMockEnabled(window.location.search, import.meta.env.DEV);

  const currentMovie = movies[currentIndex] || movies[0];
  const currentMovieKey = getHeroMovieKey(currentMovie, currentIndex);

  const trailerActive = [
    HERO_PHASES.TRAILER_ENTERING,
    HERO_PHASES.TRAILER_EXPANDED,
    HERO_PHASES.TRAILER_COMPACT,
  ].includes(machine.phase);
  const trailerLoading = machine.phase === HERO_PHASES.TRAILER_LOADING;
  const trailerFailed = machine.phase === HERO_PHASES.TRAILER_FAILED;
  const playbackPhase = trailerLoading || trailerActive;
  const videoVisible = trailerActive && machine.visualReady && !machine.posterVisible;
  const awaitingFirstReveal = playbackPhase && revealedGeneration !== machine.generation;

  const disclosure = useHeroContentDisclosure({
    movieKey: currentMovieKey,
    phase: machine.phase,
    playbackStatus: machine.playbackStatus,
    visualReady: machine.visualReady,
    posterVisible: machine.posterVisible,
    reducedMotion,
  });

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

  const abortMetadataRequests = useCallback(({ includePrefetch = true } = {}) => {
    metadataRequestsRef.current.forEach((request, movieKey) => {
      if (!includePrefetch && request.prefetch) return;
      request.controller.abort();
      metadataRequestsRef.current.delete(movieKey);
    });
    attemptLockRef.current = null;
  }, []);

  const resetToPoster = useCallback((movieKey = machineRef.current.movieKey) => {
    abortMetadataRequests({ includePrefetch: false });
    clearPlaybackTimers();
    pendingVisualReadyRef.current = null;
    setRevealedGeneration(null);
    setPlaybackIntent(HERO_PLAYBACK_INTENT.NONE);
    setMuted(true);
    const generation = nextGeneration();
    dispatch({ type: 'POSTER_REQUESTED', generation, movieKey });
  }, [abortMetadataRequests, clearPlaybackTimers, nextGeneration]);

  useEffect(() => {
    // Resetting the playback machine is the synchronization required when the
    // selected movie identity changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetToPoster(currentMovieKey);
  }, [currentMovieKey, resetToPoster]);

  const loadHeroVideoSource = useCallback((
    targetMovie,
    targetKey,
    { force = false, prefetch = false } = {},
  ) => {
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

    metadataRequestsRef.current.set(targetKey, { controller, promise: request, prefetch });
    return request;
  }, [heroTrailerMockEnabled]);

  const preloadRemainingTrailerSources = useCallback((activeMovieKey) => {
    if (reducedMotion || saveData || !heroVisible || !documentVisible) return;

    moviesRef.current.forEach((movie, index) => {
      const movieKey = getHeroMovieKey(movie, index);
      if (
        movieKey === activeMovieKey
        || trailerCacheRef.current.has(movieKey)
        || trailerPrefetchAttemptedRef.current.has(movieKey)
      ) return;

      trailerPrefetchAttemptedRef.current.add(movieKey);

      void loadHeroVideoSource(movie, movieKey, { prefetch: true }).catch((error) => {
        if (error?.name !== 'AbortError' && import.meta.env.DEV) {
          console.warn(`Hero trailer prefetch failed for ${movieKey}:`, error.message);
        }
      });
    });
  }, [documentVisible, heroVisible, loadHeroVideoSource, reducedMotion, saveData]);

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

    // Set playback intent based on source
    const intentValue = source === 'manual'
      ? HERO_PLAYBACK_INTENT.MANUAL
      : source === 'continuation'
        ? HERO_PLAYBACK_INTENT.CONTINUATION
        : HERO_PLAYBACK_INTENT.AUTO;
    setPlaybackIntent(intentValue);

    if (source === 'manual') setAutoplaySoundBlocked(false);
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
        if (source === 'auto') {
          resetToPoster(targetKey);
          return;
        }
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
      if (source === 'auto') {
        resetToPoster(targetKey);
        return;
      }
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
  }, [loadHeroVideoSource, nextGeneration, resetToPoster]);

  const switchMovie = useCallback((targetIndex, { animate = true, continueTrailer = false } = {}) => {
    const availableMovies = moviesRef.current;
    if (!availableMovies.length || transitionLockRef.current) return;
    const normalizedIndex = ((targetIndex % availableMovies.length) + availableMovies.length) % availableMovies.length;
    if (normalizedIndex === currentIndexRef.current) return;

    abortMetadataRequests({ includePrefetch: false });
    clearPlaybackTimers();
    pendingVisualReadyRef.current = null;
    setRevealedGeneration(null);
    window.clearInterval(carouselIntervalRef.current);
    carouselIntervalRef.current = null;
    setPlaybackIntent(continueTrailer ? HERO_PLAYBACK_INTENT.CONTINUATION : HERO_PLAYBACK_INTENT.NONE);
    setMuted(true);
    disclosure.expand({ animate: false });

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
  }, [abortMetadataRequests, clearPlaybackTimers, disclosure, nextGeneration, reducedMotion]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortMetadataRequests();
      clearPlaybackTimers();
      clearTransitionTimers();
      pendingVisualReadyRef.current = null;
      transitionLockRef.current = false;
      window.clearInterval(carouselIntervalRef.current);
      carouselIntervalRef.current = null;
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
      setPlaybackIntent(HERO_PLAYBACK_INTENT.NONE);
      setMovies(nextMovies);
      dispatch({ type: 'MOVIE_CHANGED', generation, movieKey: nextKey });
    };

    const loadHero = async () => {
      try {
        const data = await fetchHomeHero({ signal: controller.signal });
        if (controller.signal.aborted) return;
        const rawMovies = Array.isArray(data.movies) && data.movies.length ? data.movies : dummyShowsData;
        const bestMovies = selectBestHeroMovies(rawMovies);
        const validMovies = await validateMovieCandidates(bestMovies, controller.signal);
        if (!controller.signal.aborted && validMovies.length) applyMovies(validMovies);
      } catch (error) {
        if (error?.name !== 'AbortError' && import.meta.env.DEV) {
          console.warn('Hero load error:', error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setHeroCatalogSettled(true);
        }
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
    const shouldComplete = !autoPreview || (introComplete && documentVisible);
    const delay = shouldComplete && autoPreview
      ? Math.max(0, Number(posterWarmupMs) || 0)
      : 0;
    // A timer callback avoids a synchronous state cascade and lets cleanup
    // cancel the gate immediately when the tab becomes hidden.
    const timerId = window.setTimeout(() => setPosterWarmupComplete(shouldComplete), delay);
    return () => window.clearTimeout(timerId);
  }, [autoPreview, documentVisible, introComplete, posterWarmupMs]);

  useEffect(() => {
    if (heroVisible && documentVisible) return;
    dispatch({ type: 'PLAYBACK_PAUSED', generation: machineRef.current.generation, now: getNow() });
  }, [documentVisible, heroVisible]);

  const isUserInitiated = playbackIntent === HERO_PLAYBACK_INTENT.MANUAL
    || playbackIntent === HERO_PLAYBACK_INTENT.CONTINUATION;

  useEffect(() => {
    if ((!reducedMotion && !saveData) || isUserInitiated) return;
    if (machineRef.current.phase === HERO_PHASES.POSTER) return;
    resetToPoster(getHeroMovieKey(moviesRef.current[currentIndexRef.current], currentIndexRef.current));
  }, [isUserInitiated, reducedMotion, resetToPoster, saveData]);

  const hasConfiguredNativeSource = Boolean(resolveConfiguredHeroVideoSource(currentMovie));
  const isPlaybackIntended = playbackIntent !== HERO_PLAYBACK_INTENT.NONE;
  const playerEnabled = Boolean(
    machine.videoSource
    && isPlaybackIntended
    && playbackPhase
    && heroVisible
    && documentVisible
  );
  const playerActive = playerEnabled && playbackPhase;

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
    if (isUserInitiated) {
      timerId = window.setTimeout(() => {
        void startTrailerAttempt({ source: 'continuation' });
      }, 0);
      return () => window.clearTimeout(timerId);
    }

    if (
      !automaticPreviewEligible
      || !heroCatalogSettled
      || (!autoPreview && !hasConfiguredNativeSource)
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
    automaticPreviewEligible,
    documentVisible,
    heroCatalogSettled,
    isUserInitiated,
    hasConfiguredNativeSource,
    heroVisible,
    machine.movieKey,
    machine.phase,
    autoPreview,
    startTrailerAttempt,
  ]);

  // Bounded fallback: when an auto-attempt fails with an eligible reason,
  // switch to the next un-attempted movie and let the auto-attempt effect
  // try again exactly once.  Manual retries never trigger this fallback.
  useEffect(() => {
    if (machine.phase !== HERO_PHASES.TRAILER_FAILED) return;

    if (playbackIntent === HERO_PLAYBACK_INTENT.AUTO) {
      const fallbackReasons = new Set([
        HERO_FAILURE_REASONS.MISSING_VIDEO,
        HERO_FAILURE_REASONS.YOUTUBE_NOT_FOUND,
        HERO_FAILURE_REASONS.YOUTUBE_EMBEDDING_BLOCKED,
      ]);

      if (fallbackReasons.has(machine.failureReason) && heroVisible && documentVisible) {
        const nextIndex = movies.findIndex((m, i) => {
          if (i === currentIndex) return false;
          return !autoAttemptedKeysRef.current.has(getHeroMovieKey(m, i));
        });

        if (nextIndex !== -1) {
          switchMovie(nextIndex, { animate: true, continueTrailer: false });
          return;
        }
      }

      // No eligible fallback — reset intent so the carousel can resume
      setPlaybackIntent(HERO_PLAYBACK_INTENT.NONE);
    }
  }, [
    currentIndex,
    documentVisible,
    heroVisible,
    machine.failureReason,
    machine.phase,
    movies,
    playbackIntent,
    switchMovie,
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
          type: 'PREVIEW_ELAPSED',
          generation,
          now: getNow(),
        });
        resetToPoster(machineRef.current.movieKey);
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
          type: 'PREVIEW_ELAPSED',
          generation,
          now: getNow(),
        });
        resetToPoster(machineRef.current.movieKey);
      }, remaining);
      playbackTimersRef.current.add(timerId);
    };

    if (machine.previewRemainingMs > 0) scheduleBudget('previewRemainingMs');

    return clearPlaybackTimers;
  }, [
    clearPlaybackTimers,
    machine.generation,
    machine.playbackStatus,
    machine.playbackStartedAt,
    machine.previewRemainingMs,
    resetToPoster,
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
      !movies.length
      || machine.phase !== HERO_PHASES.POSTER
      || isTransitioning
      || disclosure.isPointerActive
      || disclosure.isFocusActive
    ) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      switchMovie(currentIndexRef.current + 1, { animate: true, continueTrailer: false });
    }, HERO_AUTO_CAROUSEL_MS);
    carouselIntervalRef.current = intervalId;
    return () => {
      window.clearInterval(intervalId);
      if (carouselIntervalRef.current === intervalId) carouselIntervalRef.current = null;
    };
  }, [disclosure.isFocusActive, disclosure.isPointerActive, isTransitioning, machine.phase, movies.length, switchMovie]);

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

  const handleToggleMuted = useCallback(() => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    setSoundPreferred(!nextMuted);
    if (!nextMuted) setAutoplaySoundBlocked(false);
  }, [muted]);

  const handlePlayerFailure = useCallback(({ generation, reason, detail }) => {
    if (generation !== generationRef.current) return;
    abortMetadataRequests();
    clearPlaybackTimers();
    pendingVisualReadyRef.current = null;
    setRevealedGeneration(null);
    // Intent not reset here — bounded fallback effect handles AUTO cleanup
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
    if (generation === generationRef.current) {
      attemptLockRef.current = null;
      preloadRemainingTrailerSources(machineRef.current.movieKey);
    }
    dispatch({ type: 'PLAYBACK_STABLE', generation, now });
  }, [preloadRemainingTrailerSources]);

  const revealVerifiedVideo = useCallback(({ generation }) => {
    if (generation !== generationRef.current) return;
    pendingVisualReadyRef.current = null;
    setRevealedGeneration(generation);
    dispatch({ type: 'VISUAL_READY', generation });
    setMuted(!(soundPreferred && !autoplaySoundBlocked));
  }, [autoplaySoundBlocked, soundPreferred]);

  const handleVisualReady = useCallback((payload) => {
    if (!posterWarmupComplete) {
      pendingVisualReadyRef.current = payload;
      return;
    }
    revealVerifiedVideo(payload);
  }, [posterWarmupComplete, revealVerifiedVideo]);

  useEffect(() => {
    if (!posterWarmupComplete) return;
    const pending = pendingVisualReadyRef.current;
    const currentMachine = machineRef.current;
    if (
      !pending
      || pending.generation !== currentMachine.generation
      || currentMachine.playbackStatus !== HERO_PLAYBACK_STATUS.STABLE
    ) return;
    revealVerifiedVideo(pending);
  }, [posterWarmupComplete, revealVerifiedVideo]);

  const handleVisualHidden = useCallback(({ generation }) => {
    pendingVisualReadyRef.current = null;
    setMuted(true);
    dispatch({ type: 'VISUAL_HIDDEN', generation });
  }, []);

  const handlePlaybackPaused = useCallback(({ generation, now }) => {
    pendingVisualReadyRef.current = null;
    setMuted(true);
    dispatch({ type: 'PLAYBACK_PAUSED', generation, now });
  }, []);

  const handleBufferingSustained = useCallback(({ generation, now }) => {
    pendingVisualReadyRef.current = null;
    setMuted(true);
    dispatch({ type: 'BUFFERING_SUSTAINED', generation, now });
  }, []);

  const handleEnded = useCallback(({ generation }) => {
    if (generation !== generationRef.current) return;
    setMuted(true);
    resetToPoster(machineRef.current.movieKey);
  }, [resetToPoster]);

  const handleAutoplayBlocked = useCallback((...args) => {
    const meta = args[1];
    const generation = meta?.generation ?? generationRef.current;
    setAutoplaySoundBlocked(true);
    setMuted(true);
    dispatch({ type: 'AUTOPLAY_SOUND_BLOCKED', generation });
  }, []);

  const handleMutedFallback = useCallback((meta) => {
    const generation = meta?.generation ?? generationRef.current;
    setAutoplaySoundBlocked(true);
    setMuted(true);
    dispatch({ type: 'AUDIO_FALLBACK_MUTED', generation });
  }, []);

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
    <section
      ref={rootRef}
      className={`hero-section ${disclosure.isCompact ? 'is-compact' : ''}`.trim()}
      aria-label="Featured movie"
      data-intro-complete={introComplete ? 'true' : 'false'}
      data-poster-warmup-complete={posterWarmupComplete ? 'true' : 'false'}
      data-video-visible={videoVisible ? 'true' : 'false'}
    >
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
            volume={60}
            onPlayerReady={handlePlayerReady}
            onPlaybackRequested={handlePlaybackRequested}
            onPlaybackPlaying={handlePlaybackPlaying}
            onPlaybackStable={handlePlaybackStable}
            onVisualReady={handleVisualReady}
            onVisualHidden={handleVisualHidden}
            onPlaybackPaused={handlePlaybackPaused}
            onBufferingSustained={handleBufferingSustained}
            onAutoplayBlocked={handleAutoplayBlocked}
            onMutedFallback={handleMutedFallback}
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
        movieKey={currentMovieKey}
        index={currentIndex}
        movie={currentMovie}
        year={currentMovie.release_date?.slice(0, 4) || 'N/A'}
        runtime={formatRuntime(currentMovie.runtime)}
        rating={Number.isFinite(currentMovie.vote_average) ? currentMovie.vote_average.toFixed(1) : 'N/A'}
        disclosureState={disclosure.disclosureState}
        trailerActive={trailerActive}
        trailerLoading={awaitingFirstReveal}
        trailerFailed={trailerFailed}
        trailerAvailable={true}
        failureReason={machine.failureReason}
        onBook={navigateToMovie}
        onDetails={navigateToMovie}
        onToggleTrailer={handleToggleTrailer}
        showVolumeControl={videoVisible && machine.playbackStatus === HERO_PLAYBACK_STATUS.STABLE}
        muted={muted}
        onToggleMuted={handleToggleMuted}
        onPointerEnter={disclosure.handlePointerEnter}
        onPointerLeave={disclosure.handlePointerLeave}
        onFocusCapture={disclosure.handleFocusCapture}
        onBlurCapture={disclosure.handleBlurCapture}
        onCompactTitleClick={disclosure.handleCompactTitleClick}
        onCtaClick={disclosure.notifyCtaInteraction}
      />

      <HeroPosterRail
        movies={movies}
        currentIndex={currentIndex}
        className={disclosure.isCompact ? 'is-compact' : ''}
        hidden={disclosure.isCompact}
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
