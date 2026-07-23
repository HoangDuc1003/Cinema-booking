import React, { useCallback, useEffect, useRef, useState } from 'react';
import useYouTubePlayer from '../../hooks/useYouTubePlayer';
import {
  HERO_BUFFERING_HYSTERESIS_MS,
  HERO_FAILURE_REASONS,
  HERO_PLAYBACK_TIMEOUT_MS,
  HERO_PLAYING_HYSTERESIS_MS,
  HERO_VISUAL_READY_CONFIRM_MS,
} from './heroMachine';

const now = () => performance.now();

const YOUTUBE_VIDEO_RATIO = 16 / 9;
const YOUTUBE_OVERSCAN = 1.38;

const calculateYouTubeCover = (containerW, containerH) => {
  if (containerW <= 0 || containerH <= 0) return null;
  const containerRatio = containerW / containerH;
  let frameW, frameH;

  if (containerRatio > YOUTUBE_VIDEO_RATIO) {
    frameW = containerW;
    frameH = containerW / YOUTUBE_VIDEO_RATIO;
  } else {
    frameH = containerH;
    frameW = containerH * YOUTUBE_VIDEO_RATIO;
  }

  frameW *= YOUTUBE_OVERSCAN;
  frameH *= YOUTUBE_OVERSCAN;

  return {
    width: frameW,
    height: frameH,
  };
};

const YOUTUBE_FAILURE_BY_CODE = Object.freeze({
  2: HERO_FAILURE_REASONS.YOUTUBE_INVALID_PARAMETER,
  5: HERO_FAILURE_REASONS.YOUTUBE_HTML5_ERROR,
  100: HERO_FAILURE_REASONS.YOUTUBE_NOT_FOUND,
  101: HERO_FAILURE_REASONS.YOUTUBE_EMBEDDING_BLOCKED,
  150: HERO_FAILURE_REASONS.YOUTUBE_EMBEDDING_BLOCKED,
});

const HeroYouTubeVideo = ({
  enabled,
  active,
  visible,
  videoId,
  generation,
  muted,
  volume = 60,
  startSeconds = 15,
  onPlayerReady,
  onPlaybackRequested,
  onPlaybackPlaying,
  onPlaybackStable,
  onVisualReady,
  onVisualHidden,
  onPlaybackPaused,
  onBufferingSustained,
  onAutoplayBlocked,
  onMutedFallback,
  onEnded,
  onFailure,
}) => {
  const latestRef = useRef({ enabled, active, videoId, generation });
  const shellRef = useRef(null);
  const [coverLayout, setCoverLayout] = useState(null);
  const coverLayoutRef = useRef(null);
  const quarantineCompletedRef = useRef(null);
  const playingTimerRef = useRef(null);
  const visualTimerRef = useRef(null);
  const bufferingTimerRef = useRef(null);
  const recoveryTimerRef = useRef(null);
  const startupTimerRef = useRef(null);
  const failedGenerationRef = useRef(null);

  useEffect(() => {
    latestRef.current = { enabled, active, videoId, generation };
  });

  const isCurrent = useCallback((targetGeneration, targetVideoId = videoId) => {
    const latest = latestRef.current;
    return Boolean(
      latest.enabled
      && latest.active
      && latest.generation === targetGeneration
      && latest.videoId === targetVideoId
    );
  }, [videoId]);

  const clearVerificationTimers = useCallback(() => {
    window.clearTimeout(playingTimerRef.current);
    window.clearTimeout(visualTimerRef.current);
    playingTimerRef.current = null;
    visualTimerRef.current = null;
  }, []);

  const clearBufferingTimers = useCallback(() => {
    window.clearTimeout(bufferingTimerRef.current);
    window.clearTimeout(recoveryTimerRef.current);
    bufferingTimerRef.current = null;
    recoveryTimerRef.current = null;
  }, []);

  const clearAllTimers = useCallback(() => {
    clearVerificationTimers();
    clearBufferingTimers();
    window.clearTimeout(startupTimerRef.current);
    startupTimerRef.current = null;
    quarantineCompletedRef.current = null;
  }, [clearBufferingTimers, clearVerificationTimers]);

  const fail = useCallback((reason, detail, targetGeneration, targetVideoId = videoId) => {
    if (!isCurrent(targetGeneration, targetVideoId) || failedGenerationRef.current === targetGeneration) return;
    failedGenerationRef.current = targetGeneration;
    clearAllTimers();
    onVisualHidden?.({ generation: targetGeneration });
    onPlaybackPaused?.({ generation: targetGeneration, now: now() });
    onFailure?.({ generation: targetGeneration, reason, detail });
  }, [clearAllTimers, isCurrent, onFailure, onPlaybackPaused, onVisualHidden, videoId]);

  const handlePlayerReady = useCallback((player, meta) => {
    const targetGeneration = meta?.generation ?? generation;
    if (!isCurrent(targetGeneration, meta?.videoId || videoId)) return;
    onPlayerReady?.({ generation: targetGeneration, player });
  }, [generation, isCurrent, onPlayerReady, videoId]);

  const handlePlaybackRequest = useCallback((player, meta) => {
    const targetGeneration = meta?.generation ?? generation;
    const targetVideoId = meta?.videoId || videoId;
    if (!isCurrent(targetGeneration, targetVideoId)) return;
    onPlaybackRequested?.({ generation: targetGeneration, player });
    window.clearTimeout(startupTimerRef.current);
    startupTimerRef.current = window.setTimeout(() => {
      fail(
        HERO_FAILURE_REASONS.TIMEOUT,
        { stage: 'youtube-playback-start' },
        targetGeneration,
        targetVideoId,
      );
    }, HERO_PLAYBACK_TIMEOUT_MS);
  }, [fail, generation, isCurrent, onPlaybackRequested, videoId]);

  const confirmStablePlayback = useCallback((player, targetGeneration, targetVideoId) => {
    const playingState = window.YT?.PlayerState?.PLAYING;
    const firstTime = Number(player?.getCurrentTime?.());
    clearVerificationTimers();
    playingTimerRef.current = window.setTimeout(() => {
      playingTimerRef.current = null;
      const currentTime = Number(player?.getCurrentTime?.());
      if (
        !isCurrent(targetGeneration, targetVideoId)
        || player?.getPlayerState?.() !== playingState
        || !Number.isFinite(firstTime)
        || !Number.isFinite(currentTime)
        || currentTime <= firstTime
      ) return;

      const confirmedAt = now();
      window.clearTimeout(startupTimerRef.current);
      startupTimerRef.current = null;
      onPlaybackStable?.({ generation: targetGeneration, now: confirmedAt, currentTime });

      visualTimerRef.current = window.setTimeout(() => {
        visualTimerRef.current = null;
        const visualTime = Number(player?.getCurrentTime?.());
        const layout = coverLayoutRef.current;
        const shell = shellRef.current;
        if (
          !isCurrent(targetGeneration, targetVideoId)
          || player?.getPlayerState?.() !== playingState
          || !Number.isFinite(visualTime)
          || visualTime <= currentTime
        ) return;

        if (
          !layout
          || !shell
          || layout.width < shell.clientWidth - 1
          || layout.height < shell.clientHeight - 1
        ) {
          quarantineCompletedRef.current = { generation: targetGeneration, videoId: targetVideoId, minTime: currentTime };
          return;
        }

        onVisualReady?.({ generation: targetGeneration, now: now(), currentTime: visualTime });
      }, HERO_VISUAL_READY_CONFIRM_MS);
    }, HERO_PLAYING_HYSTERESIS_MS);
  }, [clearVerificationTimers, isCurrent, onPlaybackStable, onVisualReady]);

  const handleStateChange = useCallback((event, meta) => {
    const targetGeneration = meta?.generation ?? generation;
    const targetVideoId = meta?.videoId || videoId;
    if (!isCurrent(targetGeneration, targetVideoId)) return;

    const states = window.YT?.PlayerState || {};
    if (event.data === states.PLAYING) {
      clearBufferingTimers();
      onPlaybackPlaying?.({ generation: targetGeneration, now: now() });
      confirmStablePlayback(event.target, targetGeneration, targetVideoId);
      return;
    }

    clearVerificationTimers();
    if (event.data === states.ENDED) {
      clearAllTimers();
      onVisualHidden?.({ generation: targetGeneration });
      onPlaybackPaused?.({ generation: targetGeneration, now: now() });
      onEnded?.({ generation: targetGeneration });
      return;
    }

    if (event.data === states.BUFFERING) {
      onVisualHidden?.({ generation: targetGeneration });
      onPlaybackPaused?.({ generation: targetGeneration, now: now() });
      clearBufferingTimers();
      bufferingTimerRef.current = window.setTimeout(() => {
        bufferingTimerRef.current = null;
        if (!isCurrent(targetGeneration, targetVideoId) || event.target?.getPlayerState?.() !== states.BUFFERING) return;
        onBufferingSustained?.({ generation: targetGeneration, now: now() });
        recoveryTimerRef.current = window.setTimeout(() => {
          fail(
            HERO_FAILURE_REASONS.TIMEOUT,
            { stage: 'youtube-buffering-recovery' },
            targetGeneration,
            targetVideoId,
          );
        }, HERO_PLAYBACK_TIMEOUT_MS);
      }, HERO_BUFFERING_HYSTERESIS_MS);
      return;
    }

    if ([states.PAUSED, states.CUED, states.UNSTARTED].includes(event.data)) {
      clearBufferingTimers();
      onVisualHidden?.({ generation: targetGeneration });
      onPlaybackPaused?.({ generation: targetGeneration, now: now() });
    }
  }, [
    clearAllTimers,
    clearBufferingTimers,
    clearVerificationTimers,
    confirmStablePlayback,
    fail,
    generation,
    isCurrent,
    onBufferingSustained,
    onEnded,
    onPlaybackPaused,
    onPlaybackPlaying,
    onVisualHidden,
    videoId,
  ]);

  const handleAutoplayBlocked = useCallback((event, meta) => {
    const targetGeneration = meta?.generation ?? generation;
    onAutoplayBlocked?.(event, { generation: targetGeneration, videoId: meta?.videoId || videoId });
  }, [generation, onAutoplayBlocked, videoId]);

  const handleMutedFallback = useCallback((meta) => {
    const targetGeneration = meta?.generation ?? generation;
    onMutedFallback?.({ generation: targetGeneration, videoId: meta?.videoId || videoId });
  }, [generation, onMutedFallback, videoId]);

  const handleError = useCallback((event, meta) => {
    const targetGeneration = meta?.generation ?? generation;
    const code = Number(event?.data);
    const reason = YOUTUBE_FAILURE_BY_CODE[code]
      || (event?.data === 'api-load-failed' ? HERO_FAILURE_REASONS.YOUTUBE_API_ERROR : HERO_FAILURE_REASONS.VIDEO_ERROR);
    fail(reason, {
      stage: event?.data === 'api-load-failed' ? 'youtube-api' : 'youtube-player',
      code: Number.isFinite(code) ? code : event?.data,
      message: event?.error?.message,
    }, targetGeneration, meta?.videoId || videoId);
  }, [fail, generation, videoId]);

  const { containerRef, player } = useYouTubePlayer({
    videoId,
    enabled,
    active,
    muted,
    volume,
    startSeconds,
    requestGeneration: generation,
    onReady: handlePlayerReady,
    onStateChange: handleStateChange,
    onAutoplayBlocked: handleAutoplayBlocked,
    onPlaybackRequest: handlePlaybackRequest,
    onMutedFallback: handleMutedFallback,
    onError: handleError,
    onEnded: undefined,
  });

  useEffect(() => {
    failedGenerationRef.current = null;
    clearAllTimers();
  }, [clearAllTimers, generation, videoId]);

  useEffect(() => {
    if (enabled && active) return undefined;
    clearAllTimers();
    if (enabled) {
      onVisualHidden?.({ generation });
      onPlaybackPaused?.({ generation, now: now() });
    }
    return undefined;
  }, [active, clearAllTimers, enabled, generation, onPlaybackPaused, onVisualHidden]);

  useEffect(() => {
    if (!player || !active || !visible || muted) return undefined;

    try {
      player.setVolume?.(Math.max(0, Math.min(100, Number(volume) || 60)));
      const res = player.unMute?.();
      if (res && typeof res.catch === 'function') {
        res.catch(() => {
          try { player.mute?.(); } catch {}
          handleMutedFallback({ generation, videoId });
        });
      }
      // Recover if browser autoplay policy pauses playback on unMute attempt without user gesture
      const timer = window.setTimeout(() => {
        try {
          const states = window.YT?.PlayerState || {};
          if (player.getPlayerState?.() === states.PAUSED) {
            player.mute?.();
            player.playVideo?.();
          }
        } catch {
          // Recovery check is best effort
        }
      }, 120);

      return () => window.clearTimeout(timer);
    } catch {
      try { player.mute?.(); } catch {}
      handleMutedFallback({ generation, videoId });
      return undefined;
    }
  }, [active, generation, handleMutedFallback, muted, player, videoId, visible, volume]);

  useEffect(() => () => clearAllTimers(), [clearAllTimers]);

  const updateCoverLayout = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const nextLayout = calculateYouTubeCover(shell.clientWidth, shell.clientHeight);
    if (nextLayout) {
      coverLayoutRef.current = { ...nextLayout, containerWidth: shell.clientWidth, containerHeight: shell.clientHeight };
      setCoverLayout(nextLayout);
      const pending = quarantineCompletedRef.current;
      if (
        pending
        && pending.generation === generation
        && isCurrent(generation, videoId)
        && nextLayout.width >= shell.clientWidth - 1
        && nextLayout.height >= shell.clientHeight - 1
      ) {
        const visualTime = Number(player?.getCurrentTime?.());
        const playingState = window.YT?.PlayerState?.PLAYING;
        if (
          player?.getPlayerState?.() === playingState
          && Number.isFinite(visualTime)
          && visualTime > pending.minTime
        ) {
          quarantineCompletedRef.current = null;
          onVisualReady?.({ generation, now: now(), currentTime: visualTime });
        }
      }
    }
  }, [generation, isCurrent, onVisualReady, player, videoId]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateCoverLayout);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [updateCoverLayout]);

  useEffect(() => {
    updateCoverLayout();
  }, [generation, updateCoverLayout]);

  useEffect(() => {
    if (!import.meta.env.DEV || !player) return undefined;
    const diagnostic = {
      getSnapshot: () => {
        let captionModules = [];
        let captionTracks = [];
        try {
          captionModules = player.getOptions?.() || [];
          captionTracks = player.getOption?.('captions', 'tracklist') || [];
        } catch {
          // Diagnostics must not affect playback when caption APIs differ.
        }
        return {
          generation,
          kind: 'youtube',
          videoId,
          playerState: player.getPlayerState?.(),
          currentTime: Number(player.getCurrentTime?.()) || 0,
          captionModuleAvailable: captionModules.includes?.('captions') || false,
          captionTrackCount: Array.isArray(captionTracks) ? captionTracks.length : 0,
        };
      },
    };
    window.__NITROCINE_HERO_MEDIA_DIAGNOSTICS__ = diagnostic;
    return () => {
      if (window.__NITROCINE_HERO_MEDIA_DIAGNOSTICS__ === diagnostic) {
        delete window.__NITROCINE_HERO_MEDIA_DIAGNOSTICS__;
      }
    };
  }, [generation, player, videoId]);

  const mountStyle = coverLayout ? {
    position: 'absolute',
    width: `${coverLayout.width}px`,
    height: `${coverLayout.height}px`,
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: 'none',
    pointerEvents: 'none',
    backfaceVisibility: 'hidden',
    willChange: 'transform',
  } : undefined;

  return (
    <div
      ref={shellRef}
      className={`hero-video-shell hero-youtube-video ${visible ? 'is-visible' : ''}`}
      aria-hidden="true"
      data-video-safe={visible ? 'true' : 'false'}
      data-video-id={videoId}
    >
      <div className="hero-video-frame">
        <div ref={containerRef} className="hero-youtube-video__mount" style={mountStyle} />
      </div>
    </div>
  );
};

export default React.memo(HeroYouTubeVideo);
