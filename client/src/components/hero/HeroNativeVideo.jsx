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
const MAX_AUTOMATIC_RESUMES = 2;
const RESUME_DELAY_MS = 180;

const normalizeVolume = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.35;
  return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
};

const HeroNativeVideo = ({
  enabled,
  active,
  visible,
  src,
  mimeType,
  poster,
  generation,
  muted,
  volume = 0.35,
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
  const videoRef = useRef(null);
  const sourceRef = useRef(null);
  const latestRef = useRef({ enabled, active, src, generation });
  const failedGenerationRef = useRef(null);
  const playPromiseRef = useRef(null);
  const verificationTimerRef = useRef(null);
  const startupTimerRef = useRef(null);
  const bufferingTimerRef = useRef(null);
  const recoveryTimerRef = useRef(null);
  const resumeTimerRef = useRef(null);
  const automaticResumeCountRef = useRef(0);
  const [verifiedGeneration, setVerifiedGeneration] = useState(null);

  useEffect(() => {
    latestRef.current = { enabled, active, src, generation };
  }, [active, enabled, generation, src]);

  const isCurrent = useCallback((targetGeneration = generation, targetSrc = src) => {
    const latest = latestRef.current;
    return Boolean(
      latest.enabled
      && latest.generation === targetGeneration
      && latest.src === targetSrc
    );
  }, [generation, src]);

  const clearTimers = useCallback(() => {
    window.clearTimeout(verificationTimerRef.current);
    window.clearTimeout(startupTimerRef.current);
    window.clearTimeout(bufferingTimerRef.current);
    window.clearTimeout(recoveryTimerRef.current);
    window.clearTimeout(resumeTimerRef.current);
    verificationTimerRef.current = null;
    startupTimerRef.current = null;
    bufferingTimerRef.current = null;
    recoveryTimerRef.current = null;
    resumeTimerRef.current = null;
  }, []);

  const hideVisual = useCallback((targetGeneration = generation) => {
    setVerifiedGeneration(null);
    onVisualHidden?.({ generation: targetGeneration });
  }, [generation, onVisualHidden]);

  const fail = useCallback((reason, detail, targetGeneration = generation, targetSrc = src) => {
    if (
      !isCurrent(targetGeneration, targetSrc)
      || failedGenerationRef.current === targetGeneration
    ) return;
    failedGenerationRef.current = targetGeneration;
    clearTimers();
    hideVisual(targetGeneration);
    onPlaybackPaused?.({ generation: targetGeneration, now: now() });
    onFailure?.({ generation: targetGeneration, reason, detail });
  }, [clearTimers, generation, hideVisual, isCurrent, onFailure, onPlaybackPaused, src]);

  const canAttemptPlayback = useCallback(() => {
    const latest = latestRef.current;
    return Boolean(
      latest.enabled
      && latest.active
      && latest.generation === generation
      && latest.src === src
      && failedGenerationRef.current !== generation
      && !document.hidden
      && !navigator.connection?.saveData
    );
  }, [generation, src]);

  const requestPlay = useCallback(async ({ allowMutedFallback = true } = {}) => {
    const video = videoRef.current;
    if (!video || !canAttemptPlayback()) return false;
    if (playPromiseRef.current) return playPromiseRef.current;

    onPlaybackRequested?.({ generation, player: video });
    const attempt = async () => {
      try {
        await Promise.resolve(video.play());
        return true;
      } catch (error) {
        if (
          error?.name === 'NotAllowedError'
          && allowMutedFallback
          && !video.muted
          && canAttemptPlayback()
        ) {
          onAutoplayBlocked?.(error, { generation, videoId: src });
          video.muted = true;
          onMutedFallback?.({ generation, videoId: src });
          try {
            await Promise.resolve(video.play());
            return true;
          } catch (mutedError) {
            if (mutedError?.name === 'AbortError') return false;
            fail(
              HERO_FAILURE_REASONS.VIDEO_ERROR,
              { stage: 'native-muted-play', message: mutedError?.message },
              generation,
              src,
            );
            return false;
          }
        }

        if (error?.name !== 'AbortError') {
          fail(
            error?.name === 'NotAllowedError'
              ? HERO_FAILURE_REASONS.AUTOPLAY_BLOCKED
              : HERO_FAILURE_REASONS.VIDEO_ERROR,
            { stage: 'native-play', message: error?.message },
            generation,
            src,
          );
        }
        return false;
      }
    };

    playPromiseRef.current = attempt().finally(() => {
      playPromiseRef.current = null;
    });
    return playPromiseRef.current;
  }, [
    canAttemptPlayback,
    fail,
    generation,
    onAutoplayBlocked,
    onMutedFallback,
    onPlaybackRequested,
    src,
  ]);

  const beginPlaybackVerification = useCallback((video) => {
    const initialTime = Number(video.currentTime);
    const startedAt = now();
    window.clearTimeout(verificationTimerRef.current);

    const verify = () => {
      verificationTimerRef.current = null;
      if (!isCurrent(generation, src) || failedGenerationRef.current === generation) return;

      const currentTime = Number(video.currentTime);
      const dimensionsReady = video.videoWidth > 0 && video.videoHeight > 0;
      const playing = !video.paused && !video.ended && video.readyState >= 2 && !video.error;
      const advanced = hasAdvancedPlayback({
        playerState: playing ? 1 : 2,
        playingState: 1,
        previousTime: initialTime,
        currentTime,
        minimumAdvance: HERO_MIN_PLAYBACK_ADVANCE_SECONDS,
      });

      if (dimensionsReady && playing && advanced) {
        window.clearTimeout(startupTimerRef.current);
        startupTimerRef.current = null;
        automaticResumeCountRef.current = 0;
        setVerifiedGeneration(generation);
        const confirmedAt = now();
        onPlaybackStable?.({ generation, now: confirmedAt, currentTime });
        onVisualReady?.({
          generation,
          now: confirmedAt,
          currentTime,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
        });
        return;
      }

      if (now() - startedAt < HERO_PLAYBACK_TIMEOUT_MS && canAttemptPlayback()) {
        verificationTimerRef.current = window.setTimeout(verify, HERO_PLAYING_HYSTERESIS_MS);
      }
    };

    verificationTimerRef.current = window.setTimeout(verify, HERO_PLAYING_HYSTERESIS_MS);
  }, [
    canAttemptPlayback,
    generation,
    isCurrent,
    onPlaybackStable,
    onVisualReady,
    src,
  ]);

  const handleLoadedMetadata = useCallback((event) => {
    const video = event.currentTarget;
    if (!isCurrent(generation, src)) return;
    if (video.videoWidth <= 0 || video.videoHeight <= 0) {
      fail(
        HERO_FAILURE_REASONS.VIDEO_ERROR,
        { stage: 'native-metadata', message: 'Decoded video dimensions are unavailable.' },
        generation,
        src,
      );
      return;
    }

    onPlayerReady?.({ generation, player: video });
    window.clearTimeout(startupTimerRef.current);
    startupTimerRef.current = window.setTimeout(() => {
      fail(
        HERO_FAILURE_REASONS.TIMEOUT,
        { stage: 'native-playback-start' },
        generation,
        src,
      );
    }, HERO_PLAYBACK_TIMEOUT_MS);
    if (active) void requestPlay();
  }, [active, fail, generation, isCurrent, onPlayerReady, requestPlay, src]);

  const handlePlaying = useCallback((event) => {
    if (!isCurrent(generation, src)) return;
    window.clearTimeout(bufferingTimerRef.current);
    window.clearTimeout(recoveryTimerRef.current);
    bufferingTimerRef.current = null;
    recoveryTimerRef.current = null;
    onPlaybackPlaying?.({ generation, now: now() });
    beginPlaybackVerification(event.currentTarget);
  }, [beginPlaybackVerification, generation, isCurrent, onPlaybackPlaying, src]);

  const handlePause = useCallback(() => {
    if (!isCurrent(generation, src)) return;
    const video = videoRef.current;
    window.clearTimeout(verificationTimerRef.current);
    verificationTimerRef.current = null;
    hideVisual(generation);
    onPlaybackPaused?.({ generation, now: now() });

    if (!video || video.ended || video.error || !canAttemptPlayback()) return;
    if (automaticResumeCountRef.current >= MAX_AUTOMATIC_RESUMES) {
      fail(
        HERO_FAILURE_REASONS.TIMEOUT,
        { stage: 'native-pause-resume-limit', resumeAttempts: automaticResumeCountRef.current },
        generation,
        src,
      );
      return;
    }

    automaticResumeCountRef.current += 1;
    window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      resumeTimerRef.current = null;
      if (canAttemptPlayback()) void requestPlay({ allowMutedFallback: true });
    }, RESUME_DELAY_MS);
  }, [
    canAttemptPlayback,
    fail,
    generation,
    hideVisual,
    isCurrent,
    onPlaybackPaused,
    requestPlay,
    src,
  ]);

  const handleWaiting = useCallback(() => {
    if (!isCurrent(generation, src)) return;
    hideVisual(generation);
    window.clearTimeout(bufferingTimerRef.current);
    window.clearTimeout(recoveryTimerRef.current);
    bufferingTimerRef.current = window.setTimeout(() => {
      const video = videoRef.current;
      if (!isCurrent(generation, src) || (video?.readyState || 0) >= 3) return;
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
  }, [fail, generation, hideVisual, isCurrent, onBufferingSustained, src]);

  const handleEnded = useCallback(() => {
    if (!isCurrent(generation, src)) return;
    clearTimers();
    hideVisual(generation);
    onPlaybackPaused?.({ generation, now: now() });
    onEnded?.({ generation });
  }, [clearTimers, generation, hideVisual, isCurrent, onEnded, onPlaybackPaused, src]);

  const handleError = useCallback((event) => {
    const error = event.currentTarget.error;
    fail(
      HERO_FAILURE_REASONS.VIDEO_ERROR,
      { stage: 'native-player', code: error?.code, message: error?.message },
      generation,
      src,
    );
  }, [fail, generation, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = Boolean(muted);
    video.volume = normalizeVolume(volume);
  }, [muted, volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (enabled && active) {
      if (video.readyState >= 1 && video.paused && !video.ended) void requestPlay();
      return;
    }
    window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = null;
    if (!video.paused) video.pause();
  }, [active, enabled, requestPlay]);

  useEffect(() => {
    failedGenerationRef.current = null;
    automaticResumeCountRef.current = 0;
    clearTimers();
  }, [clearTimers, generation, src]);

  useEffect(() => () => {
    latestRef.current = { ...latestRef.current, enabled: false, active: false };
    clearTimers();
    const video = videoRef.current;
    if (!video) return;
    try {
      video.pause();
      video.removeAttribute('src');
      sourceRef.current?.removeAttribute('src');
      video.load();
    } catch {
      // The element may already be detached.
    }
  }, [clearTimers]);

  if (!enabled) return null;

  const isFullyVisible = visible && verifiedGeneration === generation;
  return (
    <div
      className={`hero-video-shell hero-native-video ${isFullyVisible ? 'is-visible' : ''}`}
      aria-hidden="true"
      data-video-safe={isFullyVisible ? 'true' : 'false'}
      data-video-id={src}
      data-video-generation={generation}
    >
      <div className="hero-video-frame">
        <video
          ref={videoRef}
          className="hero-native-video__mount"
          autoPlay
          playsInline
          muted={muted}
          preload="metadata"
          poster={poster || undefined}
          crossOrigin="anonymous"
          disablePictureInPicture
          disableRemotePlayback
          controls={false}
          controlsList="nodownload noplaybackrate noremoteplayback"
          tabIndex={-1}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            pointerEvents: 'none',
          }}
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlay={() => {
            if (active) void requestPlay();
          }}
          onPlaying={handlePlaying}
          onPause={handlePause}
          onEnded={handleEnded}
          onWaiting={handleWaiting}
          onStalled={handleWaiting}
          onError={handleError}
        >
          <source ref={sourceRef} src={src} type={mimeType} />
        </video>
      </div>
    </div>
  );
};

export default React.memo(HeroNativeVideo);
