import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { fetchHomeHero } from '../services/tmdb';
import HeroContent from './hero/HeroContent';
import HeroMedia from './hero/HeroMedia';
import HeroPosterRail from './hero/HeroPosterRail';
import HeroVideoRenderer from './hero/HeroVideoRenderer';
import { buildHeroImageCandidates } from './hero/heroImages';
import {
  HERO_NATIVE_MOCK_FIXTURE,
  isHeroTrailerMockEnabled,
} from './hero/heroMock';
import { resolveConfiguredHeroVideoSource } from './hero/heroVideoSource';
import {
  HERO_FAILURE_REASONS,
  HERO_PHASES,
  HERO_PLAYBACK_STATUS,
} from './hero/heroMachine';
import { useHeroContentDisclosure } from './hero/useHeroContentDisclosure';
import {
  HERO_MAX_MOVIES,
  formatRuntime,
  getHeroMovieKey,
  getInitialHeroPayload,
  saveHeroMoviesCache,
  validateMovieCandidates,
} from './hero/heroCatalogLoader';
import {
  useMediaQuery,
  useSaveData,
  useSlowNetwork,
} from './hero/useHeroEnvironment';
import './hero/hero.css';

const HERO_POSTER_SWAP_DELAY_MS = 400;
const HERO_POSTER_TRANSITION_MS = 1_200;
const HERO_AUTO_CAROUSEL_MS = 5_000;
const HERO_ENDED_POSTER_HOLD_MS = 1_000;
const HERO_FAILED_POSTER_HOLD_MS = HERO_AUTO_CAROUSEL_MS;
const HERO_AUDIO_RAMP_MS = 450;
const HERO_AUDIO_CONSENT_KEY = 'nitrocine:hero-audio-consent';
const HERO_AUDIO_VOLUME_KEY = 'nitrocine:hero-volume';

const PLAYBACK_INTENT = Object.freeze({
  AUTO: 'auto',
  MANUAL: 'manual',
  CONTINUATION: 'continuation',
});

let sessionAudioConsent = null;
let sessionAudioVolume = null;

const clampVolume = (value, fallback = 0.35) => {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number > 1 ? number / 100 : number));
};

const readStoredAudio = () => {
  if (sessionAudioConsent) {
    return {
      consent: sessionAudioConsent,
      volume: clampVolume(sessionAudioVolume),
    };
  }
  try {
    const rawConsent = window.localStorage.getItem(HERO_AUDIO_CONSENT_KEY);
    const consent = rawConsent === 'enabled'
      ? 'enabled'
      : rawConsent === 'disabled'
        ? 'disabled'
        : null;
    const volume = clampVolume(window.localStorage.getItem(HERO_AUDIO_VOLUME_KEY));
    sessionAudioConsent = consent;
    sessionAudioVolume = volume;
    return { consent, volume };
  } catch {
    return { consent: null, volume: 0.35 };
  }
};

const persistAudio = ({ consent, volume }) => {
  sessionAudioConsent = consent;
  sessionAudioVolume = clampVolume(volume);
  try {
    window.localStorage.setItem(HERO_AUDIO_CONSENT_KEY, consent);
    window.localStorage.setItem(HERO_AUDIO_VOLUME_KEY, String(sessionAudioVolume));
  } catch {
    // Playback remains usable when storage is unavailable.
  }
};

const serverSoundEnabled = (settings) => (
  settings?.heroSoundDefaultEnabled === true
);

const resolveServerVolume = (settings, storedVolume) => (
  storedVolume ?? clampVolume(settings?.heroDefaultVolume)
);

const isSameMovieOrder = (left, right) => (
  left.length === right.length
  && left.every((movie, index) => (
    getHeroMovieKey(movie, index) === getHeroMovieKey(right[index], index)
  ))
);

const reportHeroDevelopmentEvent = (event, detail = {}) => {
  if (!import.meta.env.DEV) return;
  console.warn('[hero-native]', { event, ...detail });
};

const HeroSection = ({ autoPreview = false, onTrailerRequest = null }) => {
  const navigate = useNavigate();
  const [initialPayload] = useState(() => getInitialHeroPayload());
  const [initialAudio] = useState(readStoredAudio);

  const [movies, setMovies] = useState(initialPayload?.movies || []);
  const [settings, setSettings] = useState(initialPayload?.settings || {});
  const [catalogMeta, setCatalogMeta] = useState(initialPayload?.meta || {});
  const [catalogSource, setCatalogSource] = useState(initialPayload ? 'cache' : 'loading');
  const [catalogSettled, setCatalogSettled] = useState(Boolean(initialPayload));
  const [catalogError, setCatalogError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [videoSource, setVideoSource] = useState(null);
  const [videoGeneration, setVideoGeneration] = useState(0);
  const [playbackStatus, setPlaybackStatus] = useState(HERO_PLAYBACK_STATUS.IDLE);
  const [videoVisible, setVideoVisible] = useState(false);
  const [failureReason, setFailureReason] = useState(null);

  const [muted, setMuted] = useState(initialAudio.consent !== 'enabled');
  const [audioConsent, setAudioConsent] = useState(initialAudio.consent);
  const [audioStatus, setAudioStatus] = useState(
    initialAudio.consent === 'enabled' ? 'preferred-audible' : 'muted',
  );
  const [targetVolume, setTargetVolume] = useState(initialAudio.volume);

  const [heroVisible, setHeroVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );
  const [documentVisible, setDocumentVisible] = useState(() => !document.hidden);

  const rootRef = useRef(null);
  const mountedRef = useRef(false);
  const moviesRef = useRef(movies);
  const currentIndexRef = useRef(currentIndex);
  const generationRef = useRef(0);
  const playerRef = useRef(null);
  const audioConsentRef = useRef(initialAudio.consent);
  const failedMovieKeysRef = useRef(new Set());
  const autoAttemptedKeysRef = useRef(new Set());
  const transitionTimersRef = useRef(new Set());
  const handoffTimerRef = useRef(null);
  const carouselTimerRef = useRef(null);
  const audioFrameRef = useRef(null);
  const audioRampResolveRef = useRef(null);
  const manualPlaybackRef = useRef(false);

  const isMobileScreen = useMediaQuery('(max-width: 767px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const saveData = useSaveData();
  const slowNetwork = useSlowNetwork();
  const automaticMediaBlocked = reducedMotion || saveData || slowNetwork;
  const automaticPreviewEligible = autoPreview && !automaticMediaBlocked;
  const mockEnabled = isHeroTrailerMockEnabled(
    typeof window === 'undefined' ? '' : window.location.search,
    import.meta.env.DEV,
  );
  const allowedVideoHosts = import.meta.env.VITE_HERO_VIDEO_ALLOWED_HOSTS || 'res.cloudinary.com';

  const currentMovie = movies[currentIndex] || movies[0];
  const currentMovieKey = getHeroMovieKey(currentMovie, currentIndex);
  const videoMounted = Boolean(videoSource);
  const trailerLoading = videoMounted && playbackStatus !== HERO_PLAYBACK_STATUS.STABLE;
  const trailerActive = videoMounted && playbackStatus === HERO_PLAYBACK_STATUS.STABLE;
  const trailerFailed = playbackStatus === HERO_PLAYBACK_STATUS.FAILED;
  const phase = trailerFailed
    ? HERO_PHASES.TRAILER_FAILED
    : trailerActive
      ? HERO_PHASES.TRAILER_EXPANDED
      : trailerLoading
        ? HERO_PHASES.TRAILER_LOADING
        : HERO_PHASES.POSTER;

  const disclosure = useHeroContentDisclosure({
    movieKey: currentMovieKey,
    phase,
    playbackStatus,
    visualReady: videoVisible,
    posterVisible: !videoVisible,
    reducedMotion,
  });
  const posterCarouselPaused = disclosure.isPointerActive || disclosure.isFocusActive;
  const expandDisclosure = disclosure.expand;

  useEffect(() => {
    moviesRef.current = movies;
    currentIndexRef.current = currentIndex;
  }, [currentIndex, movies]);

  useEffect(() => {
    audioConsentRef.current = audioConsent;
  }, [audioConsent]);

  const clearHandoff = useCallback(() => {
    window.clearTimeout(handoffTimerRef.current);
    handoffTimerRef.current = null;
  }, []);

  const clearTransitionTimers = useCallback(() => {
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    transitionTimersRef.current.clear();
  }, []);

  const cancelAudioRamp = useCallback(() => {
    window.cancelAnimationFrame(audioFrameRef.current);
    audioFrameRef.current = null;
    audioRampResolveRef.current?.(false);
  }, []);

  const nextGeneration = useCallback(() => {
    generationRef.current += 1;
    setVideoGeneration(generationRef.current);
    return generationRef.current;
  }, []);

  const stopPlayback = useCallback(({ failed = false, reason = null } = {}) => {
    cancelAudioRamp();
    playerRef.current = null;
    manualPlaybackRef.current = false;
    nextGeneration();
    setVideoSource(null);
    setVideoVisible(false);
    setPlaybackStatus(failed ? HERO_PLAYBACK_STATUS.FAILED : HERO_PLAYBACK_STATUS.IDLE);
    setFailureReason(reason);
    setMuted(audioConsentRef.current !== 'enabled');
    setAudioStatus(audioConsentRef.current === 'enabled' ? 'preferred-audible' : 'muted');
  }, [cancelAudioRamp, nextGeneration]);

  const resolveMovieSource = useCallback((movie) => {
    if (!movie) return null;
    const configuredMovie = mockEnabled
      ? {
        ...movie,
        heroVideoUrl: HERO_NATIVE_MOCK_FIXTURE.videoUrl,
        heroVideoMimeType: HERO_NATIVE_MOCK_FIXTURE.mimeType,
        heroVideoStatus: 'ready',
        heroVideoVersion: 'development-mock',
      }
      : movie;
    return resolveConfiguredHeroVideoSource(configuredMovie, {
      mockEnabled,
      isProduction: import.meta.env.PROD,
      allowedHosts: allowedVideoHosts,
    });
  }, [allowedVideoHosts, mockEnabled]);

  const startPlaybackForIndex = useCallback((index, {
    intent = PLAYBACK_INTENT.AUTO,
  } = {}) => {
    const movie = moviesRef.current[index];
    if (!movie || !heroVisible || !documentVisible) return false;
    const manual = intent === PLAYBACK_INTENT.MANUAL;
    if (automaticMediaBlocked && !manual) return false;

    const source = resolveMovieSource(movie);
    const movieKey = getHeroMovieKey(movie, index);
    if (!source) {
      failedMovieKeysRef.current.add(movieKey);
      reportHeroDevelopmentEvent('source-rejected', { movieKey, index });
      setPlaybackStatus(HERO_PLAYBACK_STATUS.FAILED);
      setFailureReason(HERO_FAILURE_REASONS.MISSING_VIDEO);
      setVideoVisible(false);
      return false;
    }

    clearHandoff();
    cancelAudioRamp();
    const generation = nextGeneration();
    manualPlaybackRef.current = manual;
    playerRef.current = null;
    setFailureReason(null);
    setPlaybackStatus(HERO_PLAYBACK_STATUS.REQUESTED);
    setVideoVisible(false);

    const wantsSound = audioConsent === 'enabled'
      || (audioConsent == null && serverSoundEnabled(settings));
    setMuted(!wantsSound);
    setAudioStatus(wantsSound ? 'preferred-audible' : 'muted');
    setTargetVolume(resolveServerVolume(
      settings,
      audioConsent === 'enabled'
        ? (sessionAudioVolume ?? initialAudio.volume)
        : null,
    ));
    setVideoSource({
      ...source,
      poster: source.poster || movie.heroImageUrl || movie.backdrop_path || movie.poster_path || '',
      generation,
    });
    return true;
  }, [
    audioConsent,
    automaticMediaBlocked,
    cancelAudioRamp,
    clearHandoff,
    documentVisible,
    heroVisible,
    initialAudio.volume,
    nextGeneration,
    resolveMovieSource,
    settings,
  ]);

  const switchMovie = useCallback((targetIndex, {
    animate = true,
    continuePlayback = false,
    intent = PLAYBACK_INTENT.CONTINUATION,
  } = {}) => {
    const available = moviesRef.current;
    if (!available.length) return;
    const normalized = ((targetIndex % available.length) + available.length) % available.length;
    clearHandoff();
    stopPlayback();
    expandDisclosure({ animate: false });

    const commit = () => {
      currentIndexRef.current = normalized;
      setCurrentIndex(normalized);
      if (continuePlayback) {
        const startTimer = window.setTimeout(() => {
          transitionTimersRef.current.delete(startTimer);
          if (mountedRef.current && currentIndexRef.current === normalized) {
            startPlaybackForIndex(normalized, { intent });
          }
        }, 0);
        transitionTimersRef.current.add(startTimer);
      }
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
  }, [
    clearHandoff,
    clearTransitionTimers,
    expandDisclosure,
    reducedMotion,
    startPlaybackForIndex,
    stopPlayback,
  ]);

  const findNextPlayableIndex = useCallback((fromIndex) => {
    const available = moviesRef.current;
    let nextPosterIndex = -1;
    for (let offset = 1; offset <= available.length; offset += 1) {
      const index = (fromIndex + offset) % available.length;
      const key = getHeroMovieKey(available[index], index);
      if (failedMovieKeysRef.current.has(key)) continue;
      if (nextPosterIndex < 0) nextPosterIndex = index;
      if (resolveMovieSource(available[index])) {
        return index;
      }
    }
    return nextPosterIndex;
  }, [resolveMovieSource]);

  const scheduleFailureHandoff = useCallback((fromIndex) => {
    clearHandoff();
    const nextIndex = findNextPlayableIndex(fromIndex);
    if (nextIndex < 0 || nextIndex === fromIndex) return;
    handoffTimerRef.current = window.setTimeout(() => {
      handoffTimerRef.current = null;
      if (!mountedRef.current || currentIndexRef.current !== fromIndex) return;
      switchMovie(nextIndex, {
        animate: true,
        continuePlayback: true,
        intent: PLAYBACK_INTENT.CONTINUATION,
      });
    }, HERO_FAILED_POSTER_HOLD_MS);
  }, [clearHandoff, findNextPlayableIndex, switchMovie]);

  const applyServerPayload = useCallback(async (data, signal) => {
    const orderedMovies = Array.isArray(data?.movies) ? data.movies : [];
    if (orderedMovies.length !== HERO_MAX_MOVIES) {
      throw new Error(`Hero API must return exactly ${HERO_MAX_MOVIES} movies.`);
    }
    const preparedMovies = await validateMovieCandidates(orderedMovies, signal);
    if (signal.aborted) return;
    if (preparedMovies.length !== HERO_MAX_MOVIES) {
      throw new Error('Hero returned a movie without usable artwork.');
    }

    saveHeroMoviesCache(preparedMovies, {
      source: 'server',
      meta: data.meta,
      settings: data.settings,
    });
    setSettings(data.settings || {});
    setCatalogMeta(data.meta || {});
    setTargetVolume((current) => (
      audioConsentRef.current === 'enabled'
        ? current
        : clampVolume(data.settings?.heroDefaultVolume)
    ));
    setCatalogSource('server');

    if (isSameMovieOrder(moviesRef.current, preparedMovies)) {
      moviesRef.current = preparedMovies;
      setMovies(preparedMovies);
      return;
    }

    stopPlayback();
    currentIndexRef.current = 0;
    moviesRef.current = preparedMovies;
    failedMovieKeysRef.current.clear();
    autoAttemptedKeysRef.current.clear();
    setCurrentIndex(0);
    setMovies(preparedMovies);
  }, [stopPlayback]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearHandoff();
      clearTransitionTimers();
      cancelAudioRamp();
      window.clearInterval(carouselTimerRef.current);
      carouselTimerRef.current = null;
    };
  }, [cancelAudioRamp, clearHandoff, clearTransitionTimers]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setCatalogError(null);
      if (!moviesRef.current.length) {
        setCatalogSource('loading');
        setCatalogSettled(false);
      }

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const data = await fetchHomeHero({ signal: controller.signal });
          await applyServerPayload(data, controller.signal);
          break;
        } catch (error) {
          if (controller.signal.aborted || error?.name === 'AbortError') return;
          const retryable = error?.name === 'TimeoutError'
            || error?.name === 'TypeError'
            || error?.status === 429
            || error?.status >= 500;
          if (attempt === 1 || !retryable) {
            if (!moviesRef.current.length) {
              setCatalogSource('error');
              setCatalogError(error);
            }
            break;
          }
          await new Promise((resolve, reject) => {
            const timer = window.setTimeout(resolve, 650);
            controller.signal.addEventListener('abort', () => {
              window.clearTimeout(timer);
              reject(controller.signal.reason || new DOMException('Aborted', 'AbortError'));
            }, { once: true });
          });
        }
      }
      if (!controller.signal.aborted) setCatalogSettled(true);
    };
    void load();
    return () => controller.abort(new DOMException('Hero view changed', 'AbortError'));
  }, [applyServerPayload, reloadToken]);

  useEffect(() => {
    const nextRefresh = Date.parse(catalogMeta?.nextRefreshAt || '');
    if (!Number.isFinite(nextRefresh)) return undefined;
    const delay = Math.max(1_000, nextRefresh - Date.now() + 250);
    const timer = window.setTimeout(
      () => setReloadToken((token) => token + 1),
      Math.min(delay, 2_147_483_000),
    );
    return () => window.clearTimeout(timer);
  }, [catalogMeta?.nextRefreshAt, catalogMeta?.version]);

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
    const handleVisibility = () => setDocumentVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    if (!videoSource || manualPlaybackRef.current || !automaticMediaBlocked) return;
    stopPlayback();
  }, [automaticMediaBlocked, stopPlayback, videoSource]);

  useEffect(() => {
    if (
      !currentMovie
      || !catalogSettled
      || videoSource
      || playbackStatus === HERO_PLAYBACK_STATUS.FAILED
      || !automaticPreviewEligible
      || !heroVisible
      || !documentVisible
      || isTransitioning
    ) return;
    const key = getHeroMovieKey(currentMovie, currentIndex);
    if (autoAttemptedKeysRef.current.has(key)) return;
    autoAttemptedKeysRef.current.add(key);
    if (!startPlaybackForIndex(currentIndex, { intent: PLAYBACK_INTENT.AUTO })) {
      scheduleFailureHandoff(currentIndex);
    }
  }, [
    automaticPreviewEligible,
    catalogSettled,
    currentIndex,
    currentMovie,
    documentVisible,
    heroVisible,
    isTransitioning,
    playbackStatus,
    scheduleFailureHandoff,
    startPlaybackForIndex,
    videoSource,
  ]);

  useEffect(() => {
    if (
      playbackStatus !== HERO_PLAYBACK_STATUS.FAILED
      || videoSource
      || !currentMovie
    ) return;
    const movieKey = getHeroMovieKey(currentMovie, currentIndex);
    if (!failedMovieKeysRef.current.has(movieKey)) return;
    scheduleFailureHandoff(currentIndex);
  }, [
    currentIndex,
    currentMovie,
    playbackStatus,
    scheduleFailureHandoff,
    videoSource,
  ]);

  useEffect(() => {
    if (
      !movies.length
      || videoSource
      || playbackStatus === HERO_PLAYBACK_STATUS.FAILED
      || posterCarouselPaused
    ) return undefined;
    const interval = window.setInterval(() => {
      switchMovie(currentIndexRef.current + 1, { animate: true });
    }, HERO_AUTO_CAROUSEL_MS);
    carouselTimerRef.current = interval;
    return () => {
      window.clearInterval(interval);
      if (carouselTimerRef.current === interval) carouselTimerRef.current = null;
    };
  }, [
    movies.length,
    playbackStatus,
    posterCarouselPaused,
    switchMovie,
    videoSource,
  ]);

  const handlePlayerReady = useCallback(({ generation, player }) => {
    if (generation !== generationRef.current) return;
    playerRef.current = player;
  }, []);

  const handlePlaybackRequested = useCallback(({ generation }) => {
    if (generation === generationRef.current) {
      setPlaybackStatus(HERO_PLAYBACK_STATUS.REQUESTED);
    }
  }, []);

  const handlePlaybackPlaying = useCallback(({ generation }) => {
    if (generation === generationRef.current) {
      setPlaybackStatus(HERO_PLAYBACK_STATUS.PLAYING);
    }
  }, []);

  const handlePlaybackStable = useCallback(({ generation }) => {
    if (generation !== generationRef.current) return;
    setPlaybackStatus(HERO_PLAYBACK_STATUS.STABLE);
    setFailureReason(null);
    const player = playerRef.current;
    if (player && !player.muted && player.volume > 0) {
      setMuted(false);
      setAudioStatus('audible');
    }
  }, []);

  const handleVisualReady = useCallback(({ generation }) => {
    if (generation === generationRef.current) setVideoVisible(true);
  }, []);

  const handleVisualHidden = useCallback(({ generation }) => {
    if (generation === generationRef.current) setVideoVisible(false);
  }, []);

  const handlePlaybackPaused = useCallback(({ generation }) => {
    if (generation !== generationRef.current) return;
    setVideoVisible(false);
    setPlaybackStatus(HERO_PLAYBACK_STATUS.PAUSED);
  }, []);

  const handleAutoplayBlocked = useCallback((error, meta) => {
    if (meta?.generation !== generationRef.current) return;
    setMuted(true);
    setAudioStatus('blocked');
  }, []);

  const handleMutedFallback = useCallback((meta) => {
    if (meta?.generation !== generationRef.current) return;
    setMuted(true);
    setAudioStatus('blocked');
  }, []);

  const handleFailure = useCallback(({ generation, reason, detail }) => {
    if (generation !== generationRef.current) return;
    const failedIndex = currentIndexRef.current;
    const failedMovie = moviesRef.current[failedIndex];
    const movieKey = getHeroMovieKey(failedMovie, failedIndex);
    failedMovieKeysRef.current.add(movieKey);
    reportHeroDevelopmentEvent('playback-failed', {
      generation,
      index: failedIndex,
      movieKey,
      reason,
      detail,
    });
    stopPlayback({ failed: true, reason });
    scheduleFailureHandoff(failedIndex);
  }, [scheduleFailureHandoff, stopPlayback]);

  const handleEnded = useCallback(({ generation }) => {
    if (generation !== generationRef.current) return;
    const endedIndex = currentIndexRef.current;
    stopPlayback();
    if (moviesRef.current.length < 2) return;
    clearHandoff();
    handoffTimerRef.current = window.setTimeout(() => {
      handoffTimerRef.current = null;
      if (!mountedRef.current || currentIndexRef.current !== endedIndex) return;
      switchMovie(endedIndex + 1, {
        animate: true,
        continuePlayback: true,
        intent: PLAYBACK_INTENT.CONTINUATION,
      });
    }, HERO_ENDED_POSTER_HOLD_MS);
  }, [clearHandoff, stopPlayback, switchMovie]);

  const rampVolume = useCallback((player, generation, volume) => new Promise((resolve) => {
    cancelAudioRamp();
    const startedAt = performance.now();
    const settle = (value) => {
      if (audioRampResolveRef.current !== settle) return;
      audioRampResolveRef.current = null;
      resolve(value);
    };
    audioRampResolveRef.current = settle;
    const step = (timestamp) => {
      if (
        generation !== generationRef.current
        || player !== playerRef.current
        || player.paused
        || player.ended
      ) {
        audioFrameRef.current = null;
        settle(false);
        return;
      }
      const progress = Math.min(
        1,
        Math.max(0, (timestamp - startedAt) / HERO_AUDIO_RAMP_MS),
      );
      player.volume = volume * progress;
      if (progress >= 1) {
        audioFrameRef.current = null;
        settle(!player.muted && !player.paused && player.volume > 0);
        return;
      }
      audioFrameRef.current = window.requestAnimationFrame(step);
    };
    audioFrameRef.current = window.requestAnimationFrame(step);
  }), [cancelAudioRamp]);

  const enableSound = useCallback(async ({ persist = true } = {}) => {
    const player = playerRef.current;
    const generation = generationRef.current;
    if (!player || player.ended || generation !== videoGeneration) return false;
    cancelAudioRamp();
    try {
      player.volume = 0;
      player.muted = false;
      await Promise.resolve(player.play());
      setMuted(false);
      setAudioStatus('ramping');
      const active = await rampVolume(player, generation, targetVolume);
      if (!active) throw new Error('Audible playback did not remain active.');
      setAudioStatus('audible');
      if (persist) {
        persistAudio({ consent: 'enabled', volume: targetVolume });
        setAudioConsent('enabled');
      }
      return true;
    } catch {
      player.muted = true;
      setMuted(true);
      setAudioStatus('blocked');
      return false;
    }
  }, [cancelAudioRamp, rampVolume, targetVolume, videoGeneration]);

  const handleToggleMuted = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (!muted && audioStatus !== 'blocked') {
      cancelAudioRamp();
      player.muted = true;
      player.volume = targetVolume;
      setMuted(true);
      setAudioStatus('muted');
      persistAudio({ consent: 'disabled', volume: targetVolume });
      setAudioConsent('disabled');
      return;
    }
    void enableSound({ persist: true });
  }, [audioStatus, cancelAudioRamp, enableSound, muted, targetVolume]);

  useEffect(() => {
    if (audioStatus !== 'blocked') return undefined;
    let gestureAttempted = false;
    const removeGestureListeners = () => {
      window.removeEventListener('pointerdown', handleGesture);
      window.removeEventListener('touchstart', handleGesture);
      window.removeEventListener('keydown', handleGesture);
    };
    const handleGesture = (event) => {
      if (event.type === 'keydown' && event.metaKey) return;
      if (event.target instanceof Element && event.target.closest('[data-hero-sound-control]')) return;
      if (gestureAttempted) return;
      gestureAttempted = true;
      removeGestureListeners();
      void enableSound({ persist: true });
    };
    // Keep the listeners until a meaningful gesture is observed. A pointer or
    // key event on the sound control is intentionally ignored and must not
    // consume the one recovery attempt before its own click handler runs.
    window.addEventListener('pointerdown', handleGesture);
    window.addEventListener('touchstart', handleGesture, { passive: true });
    window.addEventListener('keydown', handleGesture);
    return removeGestureListeners;
  }, [audioStatus, enableSound]);

  const handlePlayTrailer = useCallback(() => {
    const key = getHeroMovieKey(currentMovie, currentIndex);
    failedMovieKeysRef.current.delete(key);
    setPlaybackStatus(HERO_PLAYBACK_STATUS.IDLE);
    setFailureReason(null);
    if (!startPlaybackForIndex(currentIndex, { intent: PLAYBACK_INTENT.MANUAL })) {
      scheduleFailureHandoff(currentIndex);
    }
  }, [
    currentIndex,
    currentMovie,
    scheduleFailureHandoff,
    startPlaybackForIndex,
  ]);

  const trailerAvailable = Boolean(resolveMovieSource(currentMovie));
  const scrollToTrailerSection = useCallback(() => {
    onTrailerRequest?.(currentMovie);
    const target = document.getElementById('trailers');
    const scroll = () => target?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
    scroll();
    window.requestAnimationFrame(() => window.requestAnimationFrame(scroll));
  }, [currentMovie, onTrailerRequest, reducedMotion]);
  const handleTrailerAction = useCallback(() => {
    if (!trailerAvailable || trailerFailed) {
      scrollToTrailerSection();
      return;
    }
    handlePlayTrailer();
  }, [handlePlayTrailer, scrollToTrailerSection, trailerAvailable, trailerFailed]);

  if (!currentMovie) {
    if (!catalogSettled) {
      return (
        <section
          ref={rootRef}
          className="hero-section hero-catalog-state"
          aria-label="Featured movie loading"
          aria-busy="true"
          data-catalog-source="loading"
        >
          <div className="hero-catalog-state__backdrop is-loading" aria-hidden="true" />
          <div className="hero-catalog-state__skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>
      );
    }
    return (
      <section
        ref={rootRef}
        className="hero-section hero-catalog-state"
        aria-label="Featured movie unavailable"
        data-catalog-source="error"
      >
        <div className="hero-catalog-state__backdrop" aria-hidden="true" />
        <div className="hero-catalog-state__error" role="alert">
          <p className="hero-catalog-state__eyebrow">NitroCine</p>
          <h1>Unable to load featured movies</h1>
          <p>{catalogError?.message || 'The server connection was interrupted. Please try again.'}</p>
          <button type="button" onClick={() => setReloadToken((token) => token + 1)}>
            <RefreshCw aria-hidden="true" />
            Try again
          </button>
        </div>
      </section>
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
  const playerActive = Boolean(
    videoSource
    && heroVisible
    && documentVisible,
  );
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
      data-catalog-batch={catalogMeta?.batchId || ''}
      data-catalog-version={catalogMeta?.version || ''}
    >
      <HeroMedia
        key={`media-${currentMovieKey}-${posterCandidates.join('|')}`}
        title={currentMovie.title || currentMovie.name}
        posterCandidates={posterCandidates}
        posterVisible={!videoVisible}
        videoVisible={videoVisible}
      >
        {videoSource && (
          <div
            role="region"
            aria-label={`Trailer for ${currentMovie.title || currentMovie.name || 'featured movie'}`}
          >
            <HeroVideoRenderer
              key={`hero-native-${videoGeneration}-${videoSource.version || videoSource.src}`}
              enabled
              active={playerActive}
              visible={videoVisible}
              source={videoSource}
              generation={videoGeneration}
              muted={muted}
              volume={targetVolume}
              onPlayerReady={handlePlayerReady}
              onPlaybackRequested={handlePlaybackRequested}
              onPlaybackPlaying={handlePlaybackPlaying}
              onPlaybackStable={handlePlaybackStable}
              onVisualReady={handleVisualReady}
              onVisualHidden={handleVisualHidden}
              onPlaybackPaused={handlePlaybackPaused}
              onBufferingSustained={handlePlaybackPaused}
              onAutoplayBlocked={handleAutoplayBlocked}
              onMutedFallback={handleMutedFallback}
              onEnded={handleEnded}
              onFailure={handleFailure}
            />
          </div>
        )}
      </HeroMedia>

      {isTransitioning && !videoVisible && (
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
        trailerLoading={trailerLoading}
        trailerFailed={trailerFailed}
        trailerAvailable={trailerAvailable}
        failureReason={failureReason}
        onBook={navigateToMovie}
        onDetails={navigateToMovie}
        onToggleTrailer={handleTrailerAction}
        showVolumeControl={videoMounted && (
          playbackStatus === HERO_PLAYBACK_STATUS.STABLE || audioStatus === 'blocked'
        )}
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
          continuePlayback: videoMounted,
          intent: PLAYBACK_INTENT.CONTINUATION,
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
