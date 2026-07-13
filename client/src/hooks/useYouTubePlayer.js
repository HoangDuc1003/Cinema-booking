import { useCallback, useEffect, useRef, useState } from 'react';

const YOUTUBE_API_SRC = 'https://www.youtube.com/iframe_api';
const YOUTUBE_API_TIMEOUT_MS = 12_000;

let youtubeApiPromise = null;

const warnInDevelopment = (...args) => {
  if (import.meta.env.DEV) console.warn(...args);
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

const getSafePlayerVars = (playerVars) => {
  const safePlayerVars = { ...playerVars };
  delete safePlayerVars.modestbranding;
  delete safePlayerVars.showinfo;
  return safePlayerVars;
};

export const useYouTubePlayer = ({
  videoId,
  startSeconds = 0,
  enabled = true,
  active = true,
  requestGeneration,
  onReady,
  onStateChange,
  onAutoplayBlocked,
  onPlaybackRequest,
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
  const requestRef = useRef({ enabled, active, videoId, startSeconds, requestGeneration });

  const [player, setPlayer] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const onReadyRef = useRef(onReady);
  const onStateChangeRef = useRef(onStateChange);
  const onAutoplayBlockedRef = useRef(onAutoplayBlocked);
  const onPlaybackRequestRef = useRef(onPlaybackRequest);
  const onErrorRef = useRef(onError);
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    onReadyRef.current = onReady;
    onStateChangeRef.current = onStateChange;
    onAutoplayBlockedRef.current = onAutoplayBlocked;
    onPlaybackRequestRef.current = onPlaybackRequest;
    onErrorRef.current = onError;
    onEndedRef.current = onEnded;
    playerVarsRef.current = playerVars;
    requestRef.current = { enabled, active, videoId, startSeconds, requestGeneration };
  });

  const destroyPlayer = useCallback(() => {
    creationGenerationRef.current += 1;
    activeRequestRef.current = null;
    loadedRequestRef.current = null;
    lastCommandKeyRef.current = '';
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

        const createdPlayer = new window.YT.Player(element, {
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: 0,
            rel: 0,
            enablejsapi: 1,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            playsinline: 1,
            ...(origin ? { origin } : {}),
            ...safePlayerVars,
          },
          events: {
            onReady: (event) => {
              if (!mountedRef.current || playerRef.current !== createdPlayer) return;

              try {
                event.target.mute?.();
              } catch (error) {
                warnInDevelopment('[YouTube Player] Initial mute failed:', error);
              }

              const iframe = event.target.getIframe?.();
              if (iframe) {
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.border = '0';
                iframe.style.display = 'block';
              }

              readyRef.current = true;
              setPlayer(event.target);
              setIsReady(true);
              onReadyRef.current?.(event.target, activeRequestRef.current);
            },
            onStateChange: (event) => {
              if (!mountedRef.current || playerRef.current !== createdPlayer) return;
              if (!requestRef.current.active) return;
              const meta = activeRequestRef.current;
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
              onAutoplayBlockedRef.current?.(event, meta);
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

        playerRef.current = createdPlayer;
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
  }, [destroyPlayer, enabled]);

  useEffect(() => {
    if (!enabled || !player || !isReady || !readyRef.current) return;

    const implicitKey = `${active ? 1 : 0}:${videoId || ''}:${startSeconds}`;
    if (requestGeneration == null && implicitRequestRef.current.key !== implicitKey) {
      implicitRequestRef.current = {
        key: implicitKey,
        generation: implicitRequestRef.current.generation + 1,
      };
    }

    const generation = requestGeneration ?? implicitRequestRef.current.generation;
    const commandKey = `${generation}:${implicitKey}`;
    if (lastCommandKeyRef.current === commandKey) return;
    lastCommandKeyRef.current = commandKey;

    if (!active || !videoId) {
      try {
        player.mute?.();
        player.pauseVideo?.();
      } catch (error) {
        warnInDevelopment('[YouTube Player] Pause failed:', error);
      }
      return;
    }

    const previousRequest = loadedRequestRef.current;
    const isResume = Boolean(
      previousRequest
      && previousRequest.generation === generation
      && previousRequest.videoId === videoId
      && previousRequest.startSeconds === startSeconds
    );
    const meta = { generation, videoId, startSeconds, isResume };
    activeRequestRef.current = meta;

    try {
      player.mute?.();
      if (!isResume) {
        player.loadVideoById?.({ videoId, startSeconds });
        loadedRequestRef.current = { generation, videoId, startSeconds };
      } else {
        player.playVideo?.();
      }
      player.mute?.();
      onPlaybackRequestRef.current?.(player, meta);
    } catch (error) {
      warnInDevelopment('[YouTube Player] Playback request failed:', error);
      onErrorRef.current?.({ data: 'playback-request-failed', error, target: player }, meta);
    }
  }, [active, enabled, isReady, player, requestGeneration, startSeconds, videoId]);

  return { containerRef, player, isReady, loadError };
};

export default useYouTubePlayer;
