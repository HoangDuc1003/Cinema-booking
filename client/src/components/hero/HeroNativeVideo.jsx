import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  HERO_BUFFERING_HYSTERESIS_MS,
  HERO_FAILURE_REASONS,
  HERO_MIN_PLAYBACK_ADVANCE_SECONDS,
  HERO_PLAYBACK_TIMEOUT_MS,
  HERO_PLAYING_HYSTERESIS_MS,
  hasAdvancedPlayback,
} from './heroMachine';

const now = () => performance.now();

const calculateCover = (containerW, containerH, videoW, videoH) => {
  if (containerW <= 0 || containerH <= 0 || videoW <= 0 || videoH <= 0) return null;
  const containerRatio = containerW / containerH;
  const videoRatio = videoW / videoH;
  let frameW, frameH;

  if (containerRatio > videoRatio) {
    frameW = containerW;
    frameH = containerW / videoRatio;
  } else {
    frameH = containerH;
    frameW = containerH * videoRatio;
  }

  return {
    width: frameW,
    height: frameH,
  };
};

const HeroNativeVideo = ({
  enabled,
  active,
  visible,
  src,
  mimeType,
  generation,
  muted,
  volume = 60,
  onPlayerReady,
  onPlaybackRequested,
  onPlaybackPlaying,
  onPlaybackStable,
  onVisualReady,
  onVisualHidden,
  onPlaybackPaused,
  onBufferingSustained,
  onAutoplayBlocked,
  onEnded,
  onFailure,
}) => {
  const latestRef = useRef({ enabled, active, src, generation });
  const videoRef = useRef(null);
  const shellRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [coverLayout, setCoverLayout] = useState(null);
  const coverLayoutRef = useRef(null);
  const quarantineCompletedRef = useRef(null);
  
  const playingTimerRef = useRef(null);
  const bufferingTimerRef = useRef(null);
  const recoveryTimerRef = useRef(null);
  const startupTimerRef = useRef(null);
  const failedGenerationRef = useRef(null);
  
  const videoSizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    latestRef.current = { enabled, active, src, generation };
  });

  const isCurrent = useCallback((targetGeneration, targetSrc = src) => {
    const latest = latestRef.current;
    return Boolean(
      latest.enabled
      && latest.active
      && latest.generation === targetGeneration
      && latest.src === targetSrc
    );
  }, [src]);

  const clearVerificationTimers = useCallback(() => {
    window.clearTimeout(playingTimerRef.current);
    playingTimerRef.current = null;
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

  const fail = useCallback((reason, detail, targetGeneration, targetSrc = src) => {
    if (!isCurrent(targetGeneration, targetSrc) || failedGenerationRef.current === targetGeneration) return;
    failedGenerationRef.current = targetGeneration;
    clearAllTimers();
    onVisualHidden?.({ generation: targetGeneration });
    onPlaybackPaused?.({ generation: targetGeneration, now: now() });
    onFailure?.({ generation: targetGeneration, reason, detail });
  }, [clearAllTimers, isCurrent, onFailure, onPlaybackPaused, onVisualHidden, src]);

  const confirmStablePlayback = useCallback((videoElement, targetGeneration, targetSrc) => {
    const firstTime = Number(videoElement.currentTime);
    clearVerificationTimers();
    playingTimerRef.current = window.setTimeout(() => {
      playingTimerRef.current = null;
      const currentTime = Number(videoElement.currentTime);
      const isActuallyPlaying = !videoElement.paused && !videoElement.ended && videoElement.readyState >= 3;
      
      if (
        !isCurrent(targetGeneration, targetSrc)
        || !hasAdvancedPlayback({
          playerState: isActuallyPlaying ? 1 : 2, // 1 = playing, 2 = paused
          playingState: 1,
          previousTime: firstTime,
          currentTime,
          minimumAdvance: HERO_MIN_PLAYBACK_ADVANCE_SECONDS,
        })
      ) return;

      const confirmedAt = now();
      window.clearTimeout(startupTimerRef.current);
      startupTimerRef.current = null;
      onPlaybackStable?.({ generation: targetGeneration, now: confirmedAt, currentTime });

      const layout = coverLayoutRef.current;
      const shell = shellRef.current;
      if (
        !layout
        || !shell
        || layout.width < shell.clientWidth - 1
        || layout.height < shell.clientHeight - 1
      ) {
        quarantineCompletedRef.current = {
          generation: targetGeneration,
          src: targetSrc,
          minTime: currentTime,
        };
        return;
      }

      onVisualReady?.({ generation: targetGeneration, now: confirmedAt, currentTime });
    }, HERO_PLAYING_HYSTERESIS_MS);
  }, [clearVerificationTimers, isCurrent, onPlaybackStable, onVisualReady]);

  const updateCoverLayout = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const { width: videoW, height: videoH } = videoSizeRef.current;
    if (!videoW || !videoH) return;
    
    const nextLayout = calculateCover(shell.clientWidth, shell.clientHeight, videoW, videoH);
    if (nextLayout) {
      coverLayoutRef.current = { ...nextLayout, containerWidth: shell.clientWidth, containerHeight: shell.clientHeight };
      setCoverLayout(nextLayout);
      const pending = quarantineCompletedRef.current;
      if (
        pending
        && pending.generation === generation
        && isCurrent(generation, src)
        && nextLayout.width >= shell.clientWidth - 1
        && nextLayout.height >= shell.clientHeight - 1
      ) {
        const videoElement = videoRef.current;
        const visualTime = Number(videoElement?.currentTime);
        const isActuallyPlaying = !videoElement?.paused && !videoElement?.ended && videoElement?.readyState >= 3;
        
        if (
          isActuallyPlaying
          && Number.isFinite(visualTime)
          && visualTime > pending.minTime
        ) {
          quarantineCompletedRef.current = null;
          onVisualReady?.({ generation, now: now(), currentTime: visualTime });
        }
      }
    }
  }, [generation, isCurrent, onVisualReady, src]);

  // Video Event Handlers
  const handleLoadedMetadata = useCallback((e) => {
    videoSizeRef.current = {
      width: e.target.videoWidth || 1920,
      height: e.target.videoHeight || 1080,
    };
    updateCoverLayout();
    
    if (isCurrent(generation, src)) {
      onPlayerReady?.({ generation, player: e.target });
      onPlaybackRequested?.({ generation, player: e.target });
      window.clearTimeout(startupTimerRef.current);
      startupTimerRef.current = window.setTimeout(() => {
        fail(
          HERO_FAILURE_REASONS.TIMEOUT,
          { stage: 'native-playback-start' },
          generation,
          src,
        );
      }, HERO_PLAYBACK_TIMEOUT_MS);
      
      if (active) {
        e.target.play().catch((err) => {
          if (err.name === 'NotAllowedError') {
            onAutoplayBlocked?.(err, { generation, videoId: src });
          } else if (err.name !== 'AbortError') {
            fail(HERO_FAILURE_REASONS.VIDEO_ERROR, { message: err.message, stage: 'native-play' }, generation, src);
          }
        });
      }
    }
  }, [active, fail, generation, isCurrent, onAutoplayBlocked, onPlaybackRequested, onPlayerReady, src, updateCoverLayout]);

  const handlePlaying = useCallback((e) => {
    if (!isCurrent(generation, src)) return;
    setIsPlaying(true);
    clearBufferingTimers();
    onPlaybackPlaying?.({ generation, now: now() });
    confirmStablePlayback(e.target, generation, src);
  }, [clearBufferingTimers, confirmStablePlayback, generation, isCurrent, onPlaybackPlaying, src]);

  const handlePause = useCallback(() => {
    if (!isCurrent(generation, src)) return;
    setIsPlaying(false);
    clearVerificationTimers();
    clearBufferingTimers();
    onVisualHidden?.({ generation });
    onPlaybackPaused?.({ generation, now: now() });
    
    // Auto-resume if still active
    if (active && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [active, clearBufferingTimers, clearVerificationTimers, generation, isCurrent, onPlaybackPaused, onVisualHidden, src]);

  const handleEnded = useCallback(() => {
    if (!isCurrent(generation, src)) return;
    setIsPlaying(false);
    clearAllTimers();
    onVisualHidden?.({ generation });
    onPlaybackPaused?.({ generation, now: now() });
    onEnded?.({ generation });
  }, [clearAllTimers, generation, isCurrent, onEnded, onPlaybackPaused, onVisualHidden, src]);

  const handleWaiting = useCallback((e) => {
    if (!isCurrent(generation, src)) return;
    onVisualHidden?.({ generation });
    onPlaybackPaused?.({ generation, now: now() });
    clearBufferingTimers();
    
    bufferingTimerRef.current = window.setTimeout(() => {
      bufferingTimerRef.current = null;
      if (!isCurrent(generation, src) || e.target.readyState >= 3) return;
      onBufferingSustained?.({ generation, now: now() });
      recoveryTimerRef.current = window.setTimeout(() => {
        fail(
          HERO_FAILURE_REASONS.TIMEOUT,
          { stage: 'native-buffering-recovery' },
          generation,
          src,
        );
      }, HERO_PLAYBACK_TIMEOUT_MS);
    }, HERO_BUFFERING_HYSTERESIS_MS);
  }, [clearBufferingTimers, fail, generation, isCurrent, onBufferingSustained, onPlaybackPaused, onVisualHidden, src]);

  const handleError = useCallback((e) => {
    if (!isCurrent(generation, src)) return;
    const error = e.target.error;
    fail(HERO_FAILURE_REASONS.VIDEO_ERROR, { 
      code: error?.code,
      message: error?.message,
      stage: 'native-player' 
    }, generation, src);
  }, [fail, generation, isCurrent, src]);

  // Volume & Mute Sync
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
      videoRef.current.volume = Math.max(0, Math.min(1, volume / 100));
    }
  }, [muted, volume]);

  // Active Sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      if (video.paused && !video.ended) {
        video.play().catch((err) => {
          if (err.name === 'NotAllowedError') {
            onAutoplayBlocked?.(err, { generation, videoId: src });
          }
        });
      }
    } else {
      video.pause();
    }
  }, [active, generation, onAutoplayBlocked, src]);

  useEffect(() => {
    failedGenerationRef.current = null;
    clearAllTimers();
  }, [clearAllTimers, generation, src]);

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
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateCoverLayout);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [updateCoverLayout]);

  useEffect(() => {
    updateCoverLayout();
  }, [generation, updateCoverLayout]);

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
    objectFit: 'cover',
  } : undefined;

  const isFullyVisible = visible && isPlaying;

  if (!enabled) return null;

  return (
    <div
      ref={shellRef}
      className={`hero-video-shell hero-native-video ${isFullyVisible ? 'is-visible' : ''}`}
      aria-hidden="true"
      data-video-safe={isFullyVisible ? 'true' : 'false'}
      data-video-id={src}
    >
      <div className="hero-video-frame">
        <video
          ref={videoRef}
          src={src}
          type={mimeType}
          style={mountStyle}
          className="hero-native-video__mount"
          playsInline
          muted={muted}
          crossOrigin="anonymous"
          onLoadedMetadata={handleLoadedMetadata}
          onPlaying={handlePlaying}
          onPause={handlePause}
          onEnded={handleEnded}
          onWaiting={handleWaiting}
          onError={handleError}
        />
      </div>
    </div>
  );
};

export default React.memo(HeroNativeVideo);
