import React, { useCallback, useEffect, useRef } from 'react';
import useYouTubePlayer from '../../hooks/useYouTubePlayer';
import {
  HERO_BUFFERING_HYSTERESIS_MS,
  HERO_FAILURE_REASONS,
  HERO_PLAYBACK_TIMEOUT_MS,
  HERO_PLAYING_HYSTERESIS_MS,
  HERO_VISUAL_READY_CONFIRM_MS,
} from './heroMachine';

const now = () => performance.now();

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
  onPlayerReady,
  onPlaybackRequested,
  onPlaybackPlaying,
  onPlaybackStable,
  onVisualReady,
  onVisualHidden,
  onPlaybackPaused,
  onBufferingSustained,
  onEnded,
  onFailure,
}) => {
  const latestRef = useRef({ enabled, active, videoId, generation });
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
        if (
          !isCurrent(targetGeneration, targetVideoId)
          || player?.getPlayerState?.() !== playingState
          || !Number.isFinite(visualTime)
          || visualTime <= currentTime
        ) return;
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
    fail(
      HERO_FAILURE_REASONS.AUTOPLAY_BLOCKED,
      { stage: 'youtube-autoplay', data: event?.data },
      targetGeneration,
      meta?.videoId || videoId,
    );
  }, [fail, generation, videoId]);

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
    requestGeneration: generation,
    onReady: handlePlayerReady,
    onStateChange: handleStateChange,
    onAutoplayBlocked: handleAutoplayBlocked,
    onPlaybackRequest: handlePlaybackRequest,
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

  useEffect(() => () => clearAllTimers(), [clearAllTimers]);

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

  return (
    <div
      className={`hero-video-shell hero-youtube-video ${visible ? 'is-visible' : ''}`}
      aria-hidden="true"
      data-video-safe={visible ? 'true' : 'false'}
      data-video-id={videoId}
    >
      <div className="hero-video-frame">
        <div ref={containerRef} className="hero-youtube-video__mount" />
      </div>
    </div>
  );
};

export default React.memo(HeroYouTubeVideo);
