import { useCallback, useEffect, useRef, useState } from 'react';

const YOUTUBE_API_SRC = 'https://www.youtube.com/iframe_api';
const YOUTUBE_API_TIMEOUT_MS = 12_000;
const DEFAULT_HERO_VOLUME = 60;

export const LOCKED_YOUTUBE_PLAYER_VARS = Object.freeze({
  autoplay: 0,
  controls: 0,
  disablekb: 1,
  fs: 0,
  iv_load_policy: 3,
  playsinline: 1,
  rel: 0,
  enablejsapi: 1,
  cc_load_policy: 0,
});

const LOCKED_PLAYER_VAR_KEYS = new Set(Object.keys(LOCKED_YOUTUBE_PLAYER_VARS));

let youtubeApiPromise = null;

const warnInDevelopment = (...args) => {
  if (import.meta.env?.DEV) console.warn(...args);
};

const loadYouTubeApi = () => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;
    const previousReadyCallback = window.onYouTubeIframeAPIReady;
    let script = document.querySelector(`script[src="${YOUTUBE_API_SRC}"]`);
    let shouldAppendScript = false;

    if (script?.dataset.nitrocineFailed === 'true') {
      script.remove();
      script = null;
    }

    const restoreGlobalCallback = () => {
      if (window.onYouTubeIframeAPIReady !== handleApiReady) return;
      if (previousReadyCallback) window.onYouTubeIframeAPIReady = previousReadyCallback;
      else delete window.onYouTubeIframeAPIReady;
    };

    const cleanup = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      script?.removeEventListener('load', handleScriptLoad);
      script?.removeEventListener('error', handleScriptError);
      restoreGlobalCallback();
    };

    const finish = () => {
      if (settled || !window.YT?.Player) return;
      settled = true;
      cleanup();
      resolve(window.YT);
    };

    const fail = (reason) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (script) {
        script.dataset.nitrocineFailed = 'true';
        script.remove();
      }
      reject(reason instanceof Error ? reason : new Error(String(reason)));
    };

    function handleApiReady(...args) {
      try {
        previousReadyCallback?.(...args);
      } catch (error) {
        warnInDevelopment('[YouTube API] Existing ready callback failed:', error);
      } finally {
        finish();
      }
    }

    function handleScriptLoad() {
      if (script) script.dataset.nitrocineLoaded = 'true';
      finish();
    }

    function handleScriptError() {
      fail(new Error('YouTube IFrame API failed to load.'));
    }

    window.onYouTubeIframeAPIReady = handleApiReady;

    if (!script) {
      script = document.createElement('script');
      script.src = YOUTUBE_API_SRC;
      script.async = true;
      script.dataset.nitrocineYoutubeApi = 'true';
      shouldAppendScript = true;
    }

    script.addEventListener('load', handleScriptLoad);
    script.addEventListener('error', handleScriptError);
    if (shouldAppendScript) document.head.appendChild(script);
    timeoutId = window.setTimeout(() => {
      fail(new Error('YouTube IFrame API timed out.'));
    }, YOUTUBE_API_TIMEOUT_MS);

    if (window.YT?.Player) finish();
  }).catch((error) => {
    youtubeApiPromise = null;
    throw error;
  });

  return youtubeApiPromise;
};

export const getSafePlayerVars = (playerVars = {}) => {
  const safePlayerVars = {};

  Object.entries(playerVars).forEach(([key, value]) => {
    if (
      LOCKED_PLAYER_VAR_KEYS.has(key)
      || key === 'cc_lang_pref'
      || key === 'modestbranding'
      || key === 'showinfo'
    ) return;

    safePlayerVars[key] = value;
  });

  return {
    ...safePlayerVars,
    ...LOCKED_YOUTUBE_PLAYER_VARS,
  };
};

export const disableCaptionsBestEffort = (player) => {
  try {
    const modules = player?.getOptions?.() || [];

    if (modules.includes?.('captions')) {
      player.setOption?.('captions', 'track', {});
    }
  } catch {
    // YouTube caption APIs differ between player versions. Playback must continue.
  }
};

const applyAudioPreference = (player, { muted, volume = DEFAULT_HERO_VOLUME }) => {
  try {
    const safeVolume = Math.max(0, Math.min(100, Number(volume) || DEFAULT_HERO_VOLUME));
    player?.setVolume?.(safeVolume);
    if (muted) player?.mute?.();
    else player?.unMute?.();
  } catch (error) {
    warnInDevelopment('[YouTube Player] Audio state update failed:', error);
  }
};

export const useYouTubePlayer = ({
  videoId,
  startSeconds = 0,
  enabled = true,
  active = true,
  muted = true,
  volume = DEFAULT_HERO_VOLUME,
  requestGeneration,
  onReady,
  onApiChange,
  onStateChange,
  onAutoplayBlocked,
  onPlaybackRequest,
  onMutedFallback,
  onError,
  onEnded,
  playerVars = {},
}) => {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const mountedRef = useRef(false);
  const readyRef = useRef(false);
  const creationGenerationRef = useRef(0);
  const implicitRequestRef = useRef({ key: '', generation: 0 });
  const activeRequestRef = useRef(null);
  const loadedRequestRef = useRef(null);
  const lastCommandKeyRef = useRef('');
  const playerVarsRef = useRef(playerVars);
  const firstPlayingCaptionKeyRef = useRef('');
  const requestRef = useRef({ enabled, active, muted, volume, videoId, startSeconds, requestGeneration });

  const [player, setPlayer] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const onReadyRef = useRef(onReady);
  const onApiChangeRef = useRef(onApiChange);
  const onStateChangeRef = useRef(onStateChange);
  const onAutoplayBlockedRef = useRef(onAutoplayBlocked);
  const onPlaybackRequestRef = useRef(onPlaybackRequest);
  const onMutedFallbackRef = useRef(onMutedFallback);
  const onErrorRef = useRef(onError);
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    onReadyRef.current = onReady;
    onApiChangeRef.current = onApiChange;
    onStateChangeRef.current = onStateChange;
    onAutoplayBlockedRef.current = onAutoplayBlocked;
    onPlaybackRequestRef.current = onPlaybackRequest;
    onMutedFallbackRef.current = onMutedFallback;
    onErrorRef.current = onError;
    onEndedRef.current = onEnded;
    playerVarsRef.current = playerVars;
    requestRef.current = { enabled, active, muted, volume, videoId, startSeconds, requestGeneration };
  });

  const destroyPlayer = useCallback(() => {
    creationGenerationRef.current += 1;
    activeRequestRef.current = null;
    loadedRequestRef.current = null;
    lastCommandKeyRef.current = '';
    firstPlayingCaptionKeyRef.current = '';
    readyRef.current = false;

    const activePlayer = playerRef.current;
    playerRef.current = null;
    try {
      activePlayer?.destroy?.();
    } catch (error) {
      warnInDevelopment('[YouTube Player] Cleanup failed:', error);
    }

    containerRef.current?.replaceChildren();
    if (mountedRef.current) {
      setPlayer(null);
      setIsReady(false);
    }
  }, []);

  const syncPlaybackRequest = useCallback((targetPlayer = playerRef.current) => {
    if (!targetPlayer || !readyRef.current) return;

    const currentRequest = requestRef.current;
    if (!currentRequest.enabled) return;

    const implicitKey = `${currentRequest.active ? 1 : 0}:${currentRequest.videoId || ''}:${currentRequest.startSeconds}`;
    if (currentRequest.requestGeneration == null && implicitRequestRef.current.key !== implicitKey) {
      implicitRequestRef.current = {
        key: implicitKey,
        generation: implicitRequestRef.current.generation + 1,
      };
    }

    const generation = currentRequest.requestGeneration ?? implicitRequestRef.current.generation;
    const commandKey = `${generation}:${implicitKey}`;
    if (lastCommandKeyRef.current === commandKey) return;
    lastCommandKeyRef.current = commandKey;

    if (!currentRequest.active || !currentRequest.videoId) {
      activeRequestRef.current = null;
      try {
        targetPlayer.mute?.();
        targetPlayer.pauseVideo?.();
      } catch (error) {
        warnInDevelopment('[YouTube Player] Pause failed:', error);
      }
      return;
    }

    const previousRequest = loadedRequestRef.current;
    const isResume = Boolean(
      previousRequest
      && previousRequest.generation === generation
      && previousRequest.videoId === currentRequest.videoId
      && previousRequest.startSeconds === currentRequest.startSeconds
    );
    const meta = {
      generation,
      videoId: currentRequest.videoId,
      startSeconds: currentRequest.startSeconds,
      isResume,
    };
    activeRequestRef.current = meta;

    try {
      // Apply audio preference: try unmuted first if preference says so.
      applyAudioPreference(targetPlayer, {
        muted: currentRequest.muted,
        volume: currentRequest.volume,
      });
      disableCaptionsBestEffort(targetPlayer);

      if (!isResume) {
        if (typeof targetPlayer.loadVideoById === 'function') {
          targetPlayer.loadVideoById({
            videoId: currentRequest.videoId,
            startSeconds: currentRequest.startSeconds,
          });
        } else if (typeof targetPlayer.playVideo === 'function') {
          targetPlayer.playVideo();
        } else {
          throw new Error('YouTube player has no playback command.');
        }
        loadedRequestRef.current = {
          generation,
          videoId: currentRequest.videoId,
          startSeconds: currentRequest.startSeconds,
        };
      } else if (typeof targetPlayer.playVideo === 'function') {
        targetPlayer.playVideo();
      } else {
        throw new Error('YouTube player cannot resume playback.');
      }

      disableCaptionsBestEffort(targetPlayer);
      applyAudioPreference(targetPlayer, {
        muted: currentRequest.muted,
        volume: currentRequest.volume,
      });

      try {
        onPlaybackRequestRef.current?.(targetPlayer, meta);
      } catch (error) {
        warnInDevelopment('[YouTube Player] Playback callback failed:', error);
      }
    } catch (error) {
      warnInDevelopment('[YouTube Player] Playback request failed:', error);
      onErrorRef.current?.({ data: 'playback-request-failed', error, target: targetPlayer }, meta);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      destroyPlayer();
    };
  }, [destroyPlayer]);

  useEffect(() => {
    if (!enabled) {
      destroyPlayer();
      return undefined;
    }

    if (playerRef.current) return undefined;

    let cancelled = false;
    const creationGeneration = ++creationGenerationRef.current;

    const createPlayer = async () => {
      try {
        await loadYouTubeApi();
        if (
          cancelled
          || !mountedRef.current
          || creationGeneration !== creationGenerationRef.current
          || !requestRef.current.enabled
          || !containerRef.current
          || !window.YT?.Player
        ) return;

        setLoadError(null);
        const element = document.createElement('div');
        element.style.width = '100%';
        element.style.height = '100%';
        containerRef.current.replaceChildren(element);

        const safePlayerVars = getSafePlayerVars(playerVarsRef.current);
        const origin = /^https?:/.test(window.location.origin) ? window.location.origin : undefined;

        let createdPlayer = null;
        createdPlayer = new window.YT.Player(element, {
          width: '100%',
          height: '100%',
          playerVars: {
            ...safePlayerVars,
            ...(origin ? { origin } : {}),
          },
          events: {
            onReady: (event) => {
              if (
                !mountedRef.current
                || creationGeneration !== creationGenerationRef.current
                || (playerRef.current && playerRef.current !== event.target)
              ) return;

              playerRef.current = event.target;
              disableCaptionsBestEffort(event.target);

              const iframe = event.target.getIframe?.();
              if (iframe) {
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.border = '0';
                iframe.style.display = 'block';
                iframe.style.pointerEvents = 'none';
                iframe.setAttribute('aria-hidden', 'true');
                iframe.setAttribute('tabindex', '-1');
                iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
              }

              readyRef.current = true;
              setPlayer(event.target);
              setIsReady(true);
              try {
                onReadyRef.current?.(event.target, activeRequestRef.current);
              } catch (error) {
                warnInDevelopment('[YouTube Player] Ready callback failed:', error);
              }
              syncPlaybackRequest(event.target);
            },
            onApiChange: (event) => {
              if (!mountedRef.current || playerRef.current !== createdPlayer) return;
              disableCaptionsBestEffort(event.target);
              try {
                onApiChangeRef.current?.(event, activeRequestRef.current);
              } catch (error) {
                warnInDevelopment('[YouTube Player] API change callback failed:', error);
              }
            },
            onStateChange: (event) => {
              if (!mountedRef.current || playerRef.current !== createdPlayer) return;
              const meta = activeRequestRef.current;
              const playingState = window.YT?.PlayerState?.PLAYING ?? 1;
              if (event.data === playingState) {
                const captionKey = meta
                  ? `${meta.generation}:${meta.videoId}`
                  : `unknown:${event.target.getVideoData?.().video_id || ''}`;
                if (firstPlayingCaptionKeyRef.current !== captionKey) {
                  firstPlayingCaptionKeyRef.current = captionKey;
                  disableCaptionsBestEffort(event.target);
                }
              }

              if (!requestRef.current.active) return;
              if (!meta) return;
              const eventVideoId = event.target.getVideoData?.().video_id;
              if (eventVideoId && eventVideoId !== meta.videoId) return;
              onStateChangeRef.current?.(event, meta);
              if (event.data === window.YT.PlayerState.ENDED) onEndedRef.current?.(meta);
            },
            onAutoplayBlocked: (event) => {
              if (!mountedRef.current || playerRef.current !== createdPlayer) return;
              if (!requestRef.current.active) return;
              const meta = activeRequestRef.current;
              if (!meta) return;
              const eventVideoId = event.target?.getVideoData?.().video_id;
              if (eventVideoId && eventVideoId !== meta.videoId) return;
              // When autoplay with sound is blocked, fallback to muted and retry once.
              onAutoplayBlockedRef.current?.(event, meta);
              try {
                const playerInstance = playerRef.current;
                if (playerInstance && readyRef.current) {
                  playerInstance.mute?.();
                  playerInstance.setVolume?.(0);
                  // Retry playback muted — just one attempt
                  if (typeof playerInstance.playVideo === 'function') {
                    playerInstance.playVideo();
                  }
                  onMutedFallbackRef.current?.(meta);
                }
              } catch (fallbackError) {
                warnInDevelopment('[YouTube Player] Muted fallback failed:', fallbackError);
              }
            },
            onError: (event) => {
              if (!mountedRef.current || playerRef.current !== createdPlayer) return;
              if (!requestRef.current.active) return;
              const meta = activeRequestRef.current;
              if (!meta) return;
              const eventVideoId = event.target?.getVideoData?.().video_id;
              if (eventVideoId && eventVideoId !== meta.videoId) return;
              onErrorRef.current?.(event, meta);
            },
          },
        });

        if (!playerRef.current) playerRef.current = createdPlayer;
      } catch (error) {
        if (cancelled || !mountedRef.current || creationGeneration !== creationGenerationRef.current) return;
        setLoadError(error);
        warnInDevelopment('[YouTube API]', error.message);
        const currentRequest = requestRef.current;
        const failureMeta = currentRequest.active && currentRequest.videoId
          ? {
              generation: currentRequest.requestGeneration ?? implicitRequestRef.current.generation,
              videoId: currentRequest.videoId,
              startSeconds: currentRequest.startSeconds,
              isResume: false,
            }
          : activeRequestRef.current;
        onErrorRef.current?.({ data: 'api-load-failed', error }, failureMeta);
      }
    };

    void createPlayer();
    return () => {
      cancelled = true;
    };
  }, [destroyPlayer, enabled, requestGeneration, syncPlaybackRequest, videoId]);

  useEffect(() => {
    if (!enabled || !player || !isReady || !readyRef.current) return;
    disableCaptionsBestEffort(player);
  }, [enabled, isReady, player, videoId]);

  useEffect(() => {
    if (!enabled || !player || !isReady || !readyRef.current) return;
    applyAudioPreference(player, { muted: active ? muted : true, volume: active ? (requestRef.current.volume || DEFAULT_HERO_VOLUME) : 0 });
  }, [active, enabled, isReady, muted, player]);

  useEffect(() => {
    if (!enabled || !player || !isReady || !readyRef.current) return;
    syncPlaybackRequest(player);
  }, [active, enabled, isReady, player, requestGeneration, startSeconds, syncPlaybackRequest, videoId]);

  return { containerRef, player, isReady, loadError };
};

export default useYouTubePlayer;
