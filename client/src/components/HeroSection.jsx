import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchHomeHero, fetchMovieTrailers } from '../services/tmdb';
import { dummyShowsData } from '../assets/assets';
import HeroContent from './hero/HeroContent';
import CinematicCurtain from './hero/CinematicCurtain';
import HeroMedia from './hero/HeroMedia';
import HeroPosterRail from './hero/HeroPosterRail';
import HeroVideoRenderer from './hero/HeroVideoRenderer';
import { buildHeroImageCandidates } from './hero/heroImages';
import { resolveYouTubeHeroVideoSource } from './hero/heroVideoSource';
import useFadeVolume from '../hooks/useFadeVolume';
import {
  HERO_FAILURE_REASONS,
  HERO_PHASES,
  HERO_PLAYER_STATUS,
  HERO_PLAYBACK_STATUS,
  createInitialHeroState,
  getPlaybackRemaining,
  heroReducer,
} from './hero/heroMachine';
import { useHeroContentDisclosure } from './hero/useHeroContentDisclosure';
import {
  HERO_MAX_MOVIES,
  formatRuntime,
  getHeroMovieKey,
  getInitialHeroMovies,
  getNow,
  saveHeroMoviesCache,
  selectBestHeroMovies,
  validateMovieCandidates,
} from './hero/heroCatalogLoader';
import { useMediaQuery, useSaveData } from './hero/useHeroEnvironment';
import './hero/hero.css';

const VIDEO_ENTER_DURATION_MS = 850;
const HERO_POSTER_SWAP_DELAY_MS = 400;
const HERO_POSTER_TRANSITION_MS = 1_200;
const HERO_AUTO_CAROUSEL_MS = 5_000;
const CURTAIN_POSTER_PREVIEW_MS = 1_000;
const CURTAIN_CLOSE_DURATION_MS = 3_000;
const CURTAIN_OPEN_DURATION_MS = 1_000;
const CURTAIN_REDUCED_MOTION_DURATION_MS = 200;
const AUDIO_REVEAL_DELAY_MS = 200;
const HERO_AUDIO_VOLUME = 60;
const HERO_AUDIO_FADE_MS = 800;
const YOUTUBE_READY_TIMEOUT_MS = 8_000;

const HERO_PLAYBACK_INTENT = Object.freeze({
  NONE: 'none',
  AUTO: 'auto',
  MANUAL: 'manual',
  CONTINUATION: 'continuation',
});

const HeroSection = ({
  autoPreview = false,
}) => {
  const navigate = useNavigate();
  const initialMoviesList = getInitialHeroMovies();
  const [movies, setMovies] = useState(initialMoviesList);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [heroCatalogSettled, setHeroCatalogSettled] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [playbackIntent, setPlaybackIntent] = useState(HERO_PLAYBACK_INTENT.NONE);
  const [muted, setMuted] = useState(true);
  const [manualPosterMode, setManualPosterMode] = useState(false);
  const [catalogSource, setCatalogSource] = useState('fallback');
  const [revealedGeneration, setRevealedGeneration] = useState(null);
  const [curtainState, setCurtainState] = useState('closed');
  const [curtainMounted, setCurtainMounted] = useState(false);
  const [cinematicRevealed, setCinematicRevealed] = useState(false);
  const [heroVisible, setHeroVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [documentVisible, setDocumentVisible] = useState(() => !document.hidden);

  const initialMovieKey = initialMoviesList.length ? getHeroMovieKey(initialMoviesList[0], 0) : 'hero-loading';
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
  const failedVideoIdsRef = useRef(new Set());
  const transitionLockRef = useRef(false);
  const transitionTimersRef = useRef(new Set());
  const playbackTimersRef = useRef(new Set());
  const carouselIntervalRef = useRef(null);
  const pendingVisualReadyRef = useRef(null);
  const pendingContinuationRef = useRef(false);
  const playerRef = useRef(null);
  const cinematicTimersRef = useRef(new Set());
  const curtainStateRef = useRef('closed');
  const curtainOpenPendingRef = useRef(null);
  const verifiedPlaybackGenerationRef = useRef(null);
  const { fadeIn, cancelFade } = useFadeVolume();

  const isMobileScreen = useMediaQuery('(max-width: 767px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const saveData = useSaveData();
  const automaticPreviewEligible = autoPreview && !saveData;

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
  const verifiedVideoVisible = trailerActive && machine.visualReady && !machine.posterVisible;
  const videoVisible = verifiedVideoVisible && (
    cinematicRevealed || curtainState === 'opening' || curtainState === 'open'
  );
  const awaitingFirstReveal = playbackPhase && (
    revealedGeneration !== machine.generation || !cinematicRevealed
  );

  const isPlaybackIntended = playbackIntent !== HERO_PLAYBACK_INTENT.NONE;
  const isUserInitiated = playbackIntent === HERO_PLAYBACK_INTENT.MANUAL
    || playbackIntent === HERO_PLAYBACK_INTENT.CONTINUATION;

  const playerEnabled = Boolean(
    machine.videoSource
    && isPlaybackIntended
    && playbackPhase
    && heroVisible
    && documentVisible
  );
  const playerActive = playerEnabled && playbackPhase;

  const disclosure = useHeroContentDisclosure({
    movieKey: currentMovieKey,
    phase: machine.phase,
    playbackStatus: machine.playbackStatus,
    // Start the old compact/expand lifecycle only after the curtain has
    // actually revealed the verified trailer, not while it is still covered.
    visualReady: cinematicRevealed && verifiedVideoVisible,
    posterVisible: machine.posterVisible || !cinematicRevealed,
    reducedMotion,
  });
  const expandHeroContent = disclosure.expand;
  const posterCarouselPaused = !manualPosterMode && (
    disclosure.isPointerActive || disclosure.isFocusActive
  );

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

  const clearCinematicTimers = useCallback(() => {
    cinematicTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    cinematicTimersRef.current.clear();
  }, []);

  const scheduleCinematicTimer = useCallback((callback, delay) => {
    const timerId = window.setTimeout(() => {
      cinematicTimersRef.current.delete(timerId);
      callback();
    }, delay);
    cinematicTimersRef.current.add(timerId);
    return timerId;
  }, []);

  const prepareCinematicAttempt = useCallback(({ mountCurtain }) => {
    clearCinematicTimers();
    cancelFade();
    playerRef.current = null;
    const nextCurtainState = mountCurtain ? 'previewing' : 'closed';
    curtainStateRef.current = nextCurtainState;
    curtainOpenPendingRef.current = null;
    verifiedPlaybackGenerationRef.current = null;
    setCurtainState(nextCurtainState);
    setCurtainMounted(mountCurtain);
    setCinematicRevealed(false);
  }, [cancelFade, clearCinematicTimers]);

  const beginCurtainOpening = useCallback((generation) => {
    if (generation !== generationRef.current) return;
    if (
      curtainStateRef.current !== 'closed'
      || verifiedPlaybackGenerationRef.current !== generation
    ) {
      curtainOpenPendingRef.current = generation;
      return;
    }

    curtainOpenPendingRef.current = null;
    curtainStateRef.current = 'opening';
    setCurtainState('opening');

    const curtainDuration = reducedMotion
      ? CURTAIN_REDUCED_MOTION_DURATION_MS
      : CURTAIN_OPEN_DURATION_MS;

    scheduleCinematicTimer(() => {
      if (generation !== generationRef.current || curtainStateRef.current !== 'opening') return;
      curtainStateRef.current = 'open';
      setCurtainState('open');
      setCinematicRevealed(true);

      scheduleCinematicTimer(() => {
        const latestMachine = machineRef.current;
        if (
          generation !== generationRef.current
          || latestMachine.playbackStatus !== HERO_PLAYBACK_STATUS.STABLE
          || !latestMachine.visualReady
        ) return;
        fadeIn(playerRef.current, {
          from: 0,
          to: HERO_AUDIO_VOLUME,
          duration: HERO_AUDIO_FADE_MS,
          onComplete: () => {
            if (generation === generationRef.current) setMuted(false);
          },
        });
      }, AUDIO_REVEAL_DELAY_MS);
    }, curtainDuration);
  }, [fadeIn, reducedMotion, scheduleCinematicTimer]);

  const beginCurtainClosing = useCallback((generation) => {
    if (generation !== generationRef.current || curtainStateRef.current !== 'previewing') return;

    scheduleCinematicTimer(() => {
      if (generation !== generationRef.current || curtainStateRef.current !== 'previewing') return;

      curtainStateRef.current = 'closing';
      setCurtainState('closing');

      const curtainDuration = reducedMotion
        ? CURTAIN_REDUCED_MOTION_DURATION_MS
        : CURTAIN_CLOSE_DURATION_MS;

      scheduleCinematicTimer(() => {
        if (generation !== generationRef.current || curtainStateRef.current !== 'closing') return;
        curtainStateRef.current = 'closed';
        setCurtainState('closed');
        beginCurtainOpening(generation);
      }, curtainDuration);
    }, CURTAIN_POSTER_PREVIEW_MS);
  }, [beginCurtainOpening, reducedMotion, scheduleCinematicTimer]);

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

  const resetToPoster = useCallback((
    movieKey = machineRef.current.movieKey,
    { nextPlaybackIntent = HERO_PLAYBACK_INTENT.NONE } = {},
  ) => {
    abortMetadataRequests({ includePrefetch: false });
    clearPlaybackTimers();
    prepareCinematicAttempt({ mountCurtain: false });
    pendingVisualReadyRef.current = null;
    setRevealedGeneration(null);
    setPlaybackIntent(nextPlaybackIntent);
    setMuted(true);
    const generation = nextGeneration();
    dispatch({ type: 'POSTER_REQUESTED', generation, movieKey });
  }, [abortMetadataRequests, clearPlaybackTimers, nextGeneration, prepareCinematicAttempt]);

  useEffect(() => {
    // Resetting the playback machine is the synchronization required when the
    // selected movie identity changes.
    const shouldContinue = pendingContinuationRef.current;
    pendingContinuationRef.current = false;
    resetToPoster(currentMovieKey, {
      nextPlaybackIntent: shouldContinue
        ? HERO_PLAYBACK_INTENT.CONTINUATION
        : HERO_PLAYBACK_INTENT.NONE,
    });
  }, [currentMovieKey, resetToPoster]);

  const loadHeroVideoSource = useCallback(async (
    targetMovie,
    targetKey,
    { force = false } = {},
  ) => {
    if (force) {
      trailerCacheRef.current.delete(targetKey);
    }

    const cachedSource = trailerCacheRef.current.get(targetKey);
    if (cachedSource) {
      return cachedSource;
    }

    // Prefer a server-provided YouTube ID when one is available.
    const directYoutube = resolveYouTubeHeroVideoSource(targetMovie);
    if (directYoutube && !failedVideoIdsRef.current.has(directYoutube.videoId)) {
      const sourceWithOffset = { ...directYoutube, startSeconds: 15 };
      trailerCacheRef.current.set(targetKey, sourceWithOffset);
      return sourceWithOffset;
    }

    // Fetch an official YouTube trailer only for the active Hero movie.
    try {
      const trailers = await fetchMovieTrailers(targetMovie);
      if (Array.isArray(trailers) && trailers.length > 0) {
        const validTrailer = trailers.find((t) => t.videoId && !failedVideoIdsRef.current.has(t.videoId));
        if (validTrailer) {
          const youtubeSource = {
            kind: 'youtube',
            videoId: validTrailer.videoId,
            title: validTrailer.title || targetMovie?.title || targetMovie?.name || 'Movie Trailer',
            startSeconds: 15,
          };
          trailerCacheRef.current.set(targetKey, youtubeSource);
          return youtubeSource;
        }
      }
    } catch (error) {
      console.warn('Hero trailer fetch error', error);
    }

    // Catalog entries without trailer metadata still get a known embeddable fallback.
    const title = String(targetMovie?.title || targetMovie?.name || '').toLowerCase();
    let fallbackVideoId = 'TcMBFSGVi1c';
    if (title.includes('terminator')) fallbackVideoId = 'k64P4l2WacU';
    else if (title.includes('night of the living dead')) fallbackVideoId = '1hL2fH-X_-8';
    else if (title.includes('toy story')) fallbackVideoId = 'w_H5k_gA8fI';
    else if (title.includes('avengers') || title.includes('marvel')) fallbackVideoId = 'hA6hldpSTF8';
    else if (title.includes('batman') || title.includes('joker')) fallbackVideoId = 'mqqft2x_Aa4';
    else if (title.includes('avatar')) fallbackVideoId = 'd9MyW72ELq0';
    else if (title.includes('dune')) fallbackVideoId = 'Way9Dexny3w';

    if (failedVideoIdsRef.current.has(fallbackVideoId)) {
      fallbackVideoId = 'TcMBFSGVi1c';
      if (failedVideoIdsRef.current.has(fallbackVideoId)) fallbackVideoId = 'Way9Dexny3w';
    }

    const fallbackYoutube = {
      kind: 'youtube',
      videoId: fallbackVideoId,
      title: targetMovie?.title || targetMovie?.name || 'Official Trailer',
      startSeconds: 15,
    };
    trailerCacheRef.current.set(targetKey, fallbackYoutube);
    return fallbackYoutube;
  }, []);

  const startTrailerAttempt = useCallback(async ({
    source = 'manual',
    forceMetadata = false,
    retryCountOverride,
  } = {}) => {
    if (attemptLockRef.current) return;
    const targetMovie = moviesRef.current[currentIndexRef.current];
    if (!targetMovie) return;

    setManualPosterMode(false);
    const targetKey = getHeroMovieKey(targetMovie, currentIndexRef.current);
    const currentMachine = machineRef.current;
    const retrying = currentMachine.phase === HERO_PHASES.TRAILER_FAILED;
    const retryCount = Number.isFinite(retryCountOverride)
      ? retryCountOverride
      : retrying
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

    // Every attempt starts silently; audio is released only after the curtain
    // has fully opened, including attempts started by the manual CTA.
    setMuted(true);
    prepareCinematicAttempt({ mountCurtain: true });

    const generation = nextGeneration();
    beginCurtainClosing(generation);
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
        resetToPoster(targetKey);
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
  }, [beginCurtainClosing, loadHeroVideoSource, nextGeneration, prepareCinematicAttempt, resetToPoster]);

  const switchMovie = useCallback((targetIndex, { animate = true, continueTrailer = false } = {}) => {
    const availableMovies = moviesRef.current;
    if (!availableMovies.length || transitionLockRef.current) return;
    const normalizedIndex = ((targetIndex % availableMovies.length) + availableMovies.length) % availableMovies.length;
    if (normalizedIndex === currentIndexRef.current) return;

    pendingContinuationRef.current = continueTrailer;
    abortMetadataRequests({ includePrefetch: false });
    clearPlaybackTimers();
    prepareCinematicAttempt({ mountCurtain: false });
    pendingVisualReadyRef.current = null;
    setRevealedGeneration(null);
    setPlaybackIntent(continueTrailer ? HERO_PLAYBACK_INTENT.CONTINUATION : HERO_PLAYBACK_INTENT.NONE);
    setMuted(true);
    expandHeroContent({ animate: false });

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
  }, [abortMetadataRequests, clearPlaybackTimers, expandHeroContent, nextGeneration, prepareCinematicAttempt, reducedMotion]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortMetadataRequests();
      clearPlaybackTimers();
      clearCinematicTimers();
      cancelFade();
      clearTransitionTimers();
      pendingVisualReadyRef.current = null;
      transitionLockRef.current = false;
      window.clearInterval(carouselIntervalRef.current);
      carouselIntervalRef.current = null;
    };
  }, [abortMetadataRequests, cancelFade, clearCinematicTimers, clearPlaybackTimers, clearTransitionTimers]);

  useEffect(() => {
    const controller = new AbortController();
    const applyMovies = (nextMovies, { source = 'server' } = {}) => {
      if (!nextMovies.length) return;
      saveHeroMoviesCache(nextMovies, { source });
      const isSameMovies = moviesRef.current.length === nextMovies.length
        && moviesRef.current.every((m, idx) => getHeroMovieKey(m, idx) === getHeroMovieKey(nextMovies[idx], idx));
      if (attemptLockRef.current || machineRef.current.phase !== HERO_PHASES.POSTER) {
        if (isSameMovies) {
          moviesRef.current = nextMovies;
          setMovies(nextMovies);
          return;
        }
      }
      abortMetadataRequests();
      prepareCinematicAttempt({ mountCurtain: false });
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

        const resolvedSource = data?.source === 'server' ? 'server' : 'fallback';
        setCatalogSource(resolvedSource);

        const rawMovies = Array.isArray(data.movies) && data.movies.length ? data.movies : dummyShowsData;
        const orderedMovies = rawMovies.slice(0, HERO_MAX_MOVIES);

        const validMovies = await validateMovieCandidates(orderedMovies, controller.signal);
        if (!controller.signal.aborted && validMovies.length) {
          applyMovies(validMovies, { source: resolvedSource });
        } else if (!controller.signal.aborted && !moviesRef.current.length) {
          const fallbackMovies = selectBestHeroMovies(dummyShowsData);
          const validFallback = await validateMovieCandidates(fallbackMovies, controller.signal);
          if (validFallback.length) applyMovies(validFallback, { source: 'fallback' });
        }
      } catch (error) {
        if (error?.name !== 'AbortError' && import.meta.env.DEV) {
          console.warn('Hero load error:', error.message);
        }
        if (!controller.signal.aborted && !moviesRef.current.length) {
          setCatalogSource('fallback');
          const fallbackMovies = selectBestHeroMovies(dummyShowsData);
          const validMovies = await validateMovieCandidates(fallbackMovies, controller.signal);
          if (validMovies.length) applyMovies(validMovies, { source: 'fallback' });
        }
      } finally {
        if (!controller.signal.aborted) {
          setHeroCatalogSettled(true);
        }
      }
    };

    void loadHero();
    return () => controller.abort();
  }, [abortMetadataRequests, nextGeneration, prepareCinematicAttempt]);

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
    if (!saveData || isUserInitiated) return;
    if (machineRef.current.phase === HERO_PHASES.POSTER) return;
    resetToPoster(getHeroMovieKey(moviesRef.current[currentIndexRef.current], currentIndexRef.current));
  }, [isUserInitiated, resetToPoster, saveData]);

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
      || isTransitioning
      || attemptLockRef.current
    ) return;

    let timerId;
    if (isUserInitiated) {
      timerId = window.setTimeout(() => {
        void startTrailerAttempt({ source: 'continuation' });
      }, 0);
      return () => window.clearTimeout(timerId);
    }

    if (manualPosterMode) return undefined;

    if (
      !automaticPreviewEligible
      || !heroCatalogSettled
      || autoAttemptedKeysRef.current.has(currentMovieKey)
    ) return undefined;

    autoAttemptedKeysRef.current.add(currentMovieKey);
    timerId = window.setTimeout(() => {
      void startTrailerAttempt({ source: 'auto' });
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [
    automaticPreviewEligible,
    currentMovie,
    currentMovieKey,
    documentVisible,
    heroCatalogSettled,
    heroVisible,
    isUserInitiated,
    isTransitioning,
    manualPosterMode,
    machine.movieKey,
    machine.phase,
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
    const isPosterMode = machine.phase === HERO_PHASES.POSTER || machine.phase === HERO_PHASES.TRAILER_FAILED;
    if (
      !movies.length
      || !isPosterMode
      || posterCarouselPaused
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
  }, [machine.phase, movies.length, posterCarouselPaused, switchMovie]);

  const handleToggleTrailer = () => {
    if (machine.phase === HERO_PHASES.TRAILER_LOADING || attemptLockRef.current) return;
    const activePhase = [
      HERO_PHASES.TRAILER_ENTERING,
      HERO_PHASES.TRAILER_EXPANDED,
      HERO_PHASES.TRAILER_COMPACT,
    ].includes(machine.phase);

    if (activePhase) {
      setManualPosterMode(true);
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
  }, [muted]);

  const handlePlayerFailure = useCallback(({ generation, reason, detail }) => {
    if (generation !== generationRef.current) return;
    abortMetadataRequests();
    clearPlaybackTimers();
    prepareCinematicAttempt({ mountCurtain: false });
    pendingVisualReadyRef.current = null;
    setRevealedGeneration(null);
    setMuted(true);

    const activeSource = machineRef.current.videoSource;
    if (activeSource?.kind === 'youtube' && activeSource?.videoId) {
      failedVideoIdsRef.current.add(activeSource.videoId);
      trailerCacheRef.current.delete(machineRef.current.movieKey);

      if (
        (reason === HERO_FAILURE_REASONS.YOUTUBE_HTML5_ERROR
          || reason === HERO_FAILURE_REASONS.YOUTUBE_EMBEDDING_BLOCKED
          || reason === HERO_FAILURE_REASONS.YOUTUBE_NOT_FOUND
          || reason === HERO_FAILURE_REASONS.YOUTUBE_API_ERROR
          || reason === HERO_FAILURE_REASONS.VIDEO_ERROR)
        && machineRef.current.retryCount < 2
      ) {
        const retryTimer = window.setTimeout(() => {
          playbackTimersRef.current.delete(retryTimer);
          const attemptSource = playbackIntent === HERO_PLAYBACK_INTENT.MANUAL ? 'manual' : 'auto';
          void startTrailerAttempt({
            source: attemptSource,
            forceMetadata: true,
            retryCountOverride: machineRef.current.retryCount + 1,
          });
        }, 50);
        playbackTimersRef.current.add(retryTimer);
        return;
      }
    }

    // Intent not reset here — bounded fallback effect handles AUTO cleanup
    dispatch({
      type: 'TRAILER_FAILED',
      generation,
      reason,
      detail,
      retryCount: machineRef.current.retryCount,
      now: getNow(),
    });
  }, [
    abortMetadataRequests,
    clearPlaybackTimers,
    playbackIntent,
    prepareCinematicAttempt,
    startTrailerAttempt,
  ]);

  const handlePlayerReady = useCallback(({ generation, player }) => {
    if (generation !== generationRef.current) return;
    playerRef.current = player;
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
    }
    dispatch({ type: 'PLAYBACK_STABLE', generation, now });
  }, []);

  const revealVerifiedVideo = useCallback(({ generation }) => {
    if (generation !== generationRef.current) return;
    pendingVisualReadyRef.current = null;
    verifiedPlaybackGenerationRef.current = generation;
    setRevealedGeneration(generation);
    dispatch({ type: 'VISUAL_READY', generation });
    setMuted(true);
  }, []);

  const handleVisualReady = useCallback((payload) => {
    revealVerifiedVideo(payload);
    if (curtainOpenPendingRef.current === payload.generation) {
      beginCurtainOpening(payload.generation);
    }
  }, [beginCurtainOpening, revealVerifiedVideo]);

  useEffect(() => {
    if (!playerEnabled || machine.playerStatus === HERO_PLAYER_STATUS.READY) return undefined;

    const timerId = window.setTimeout(() => {
      handlePlayerFailure({
        generation: machine.generation,
        reason: HERO_FAILURE_REASONS.YOUTUBE_API_ERROR,
        detail: { stage: 'youtube-player-ready-timeout' },
      });
    }, YOUTUBE_READY_TIMEOUT_MS);
    return () => window.clearTimeout(timerId);
  }, [handlePlayerFailure, machine.generation, machine.playerStatus, playerEnabled]);

  const handleCurtainRevealComplete = useCallback(() => {
    if (curtainStateRef.current !== 'open') return;
    setCurtainMounted(false);
  }, []);



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
    setMuted(true);
    dispatch({ type: 'AUTOPLAY_SOUND_BLOCKED', generation });
  }, []);

  const handleMutedFallback = useCallback((meta) => {
    const generation = meta?.generation ?? generationRef.current;
    setMuted(true);
    dispatch({ type: 'AUDIO_FALLBACK_MUTED', generation });
  }, []);

  if (!currentMovie) {
    if (!heroCatalogSettled) {
      return (
        <section
          ref={rootRef}
          className={`hero-section ${disclosure.isCompact ? 'is-compact' : ''}`.trim()}
          aria-label="Featured movie loading"
        >
          <div className="hero-poster-shell is-visible animate-pulse bg-white/5" style={{ minHeight: '480px' }} />
        </section>
      );
    }
    return null;
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
      data-video-visible={videoVisible ? 'true' : 'false'}
      data-catalog-source={catalogSource}
    >
      <HeroMedia
        key={`media-${currentMovieKey}-${posterCandidates.join('|')}`}
        title={currentMovie.title || currentMovie.name}
        posterCandidates={posterCandidates}
        posterVisible={machine.posterVisible}
        videoVisible={videoVisible}
      >
        {playerEnabled && (
          <div
            role="region"
            aria-label={`Trailer for ${currentMovie.title || currentMovie.name || 'featured movie'}`}
          >
            <HeroVideoRenderer
              key={`hero-video-${machine.generation}-${machine.videoSource.kind}`}
              enabled={playerEnabled}
              active={playerActive}
              visible={videoVisible}
              source={machine.videoSource}
              generation={machine.generation}
              muted={muted}
              volume={HERO_AUDIO_VOLUME}
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
          </div>
        )}
      </HeroMedia>

      {curtainMounted && (
        <CinematicCurtain
          state={curtainState}
          onRevealComplete={handleCurtainRevealComplete}
        />
      )}

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
        onPointerMove={disclosure.handlePointerMove}
        onPointerLeave={disclosure.handlePointerLeave}
        onFocusCapture={disclosure.handleFocusCapture}
        onBlurCapture={disclosure.handleBlurCapture}
        onCompactTitleClick={disclosure.handleCompactTitleClick}
        onCtaClick={disclosure.notifyCtaInteraction}
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
        className={disclosure.isCompacting ? 'is-compacting' : disclosure.isCompact ? 'is-compact' : ''}
        hidden={disclosure.disclosureState === 'compact'}
      />

      <div className="sr-only" aria-live="assertive">
        {videoVisible ? `Now playing trailer for ${currentMovie.title || currentMovie.name || 'featured movie'}` : ''}
      </div>
    </section>
  );
};

export default HeroSection;
