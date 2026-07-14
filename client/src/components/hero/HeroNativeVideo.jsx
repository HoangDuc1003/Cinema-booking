import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  HERO_BUFFERING_HYSTERESIS_MS,
  HERO_FAILURE_REASONS,
  HERO_PLAYBACK_TIMEOUT_MS,
  HERO_PLAYING_HYSTERESIS_MS,
  HERO_VISUAL_READY_CONFIRM_MS,
} from './heroMachine';
import { calculateCoverTransform, detectStableLetterbox } from './heroVideoCrop';

const SAMPLE_WIDTH = 160;
const SAMPLE_HEIGHT = 90;
const REQUIRED_FRAME_SAMPLES = 12;

const now = () => performance.now();

const unloadVideo = (video) => {
  if (!video) return;

  try {
    video.pause();
    video.removeAttribute('src');
    video.querySelectorAll('source').forEach((element) => element.removeAttribute('src'));
    video.load();
  } catch {
    // The element may already be detached while React is unmounting it.
  }
};

const HeroNativeVideo = ({
  enabled,
  active,
  visible,
  source,
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
  onMutedFallback,
  onEnded,
  onFailure,
}) => {
  const shellRef = useRef(null);
  const videoRef = useRef(null);
  const samplingCanvasRef = useRef(null);
  const latestRef = useRef({ enabled, active, source, generation });
  const cropRef = useRef(null);
  const samplingFramesRef = useRef([]);
  const sampleCallbackRef = useRef(null);
  const fallbackSampleTimerRef = useRef(null);
  const playbackTimeoutRef = useRef(null);
  const playingTimerRef = useRef(null);
  const visualTimerRef = useRef(null);
  const bufferingTimerRef = useRef(null);
  const recoveryTimerRef = useRef(null);
  const readyGenerationRef = useRef(null);
  const requestedCommandRef = useRef(null);
  const stableGenerationRef = useRef(null);
  const visualConfirmedGenerationRef = useRef(null);
  const visualGenerationRef = useRef(null);
  const failedGenerationRef = useRef(null);
  const [videoLayout, setVideoLayout] = useState(null);

  useEffect(() => {
    latestRef.current = { enabled, active, source, generation };
  });

  const isLoadedCurrent = useCallback((targetGeneration, targetSource = source?.src) => {
    const latest = latestRef.current;
    return Boolean(
      latest.enabled
      && latest.source?.src
      && latest.generation === targetGeneration
      && latest.source.src === targetSource
    );
  }, [source?.src]);

  const isCurrent = useCallback((targetGeneration, targetSource = source?.src) => (
    isLoadedCurrent(targetGeneration, targetSource) && latestRef.current.active
  ), [isLoadedCurrent, source?.src]);

  const clearSamplingCallback = useCallback(() => {
    const video = videoRef.current;
    if (sampleCallbackRef.current != null && video?.cancelVideoFrameCallback) {
      video.cancelVideoFrameCallback(sampleCallbackRef.current);
    }
    sampleCallbackRef.current = null;
    window.clearTimeout(fallbackSampleTimerRef.current);
    fallbackSampleTimerRef.current = null;
  }, []);

  const resetIncompleteSampling = useCallback(() => {
    clearSamplingCallback();
    if (!cropRef.current) samplingFramesRef.current = [];
  }, [clearSamplingCallback]);

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
    window.clearTimeout(playbackTimeoutRef.current);
    playbackTimeoutRef.current = null;
  }, [clearBufferingTimers, clearVerificationTimers]);

  const resetVisualLatch = useCallback(() => {
    clearVerificationTimers();
    stableGenerationRef.current = null;
    visualConfirmedGenerationRef.current = null;
    visualGenerationRef.current = null;
  }, [clearVerificationTimers]);

  const updateLayout = useCallback(() => {
    const shell = shellRef.current;
    const video = videoRef.current;
    if (!shell || !video || video.videoWidth <= 0 || video.videoHeight <= 0) return;

    const nextLayout = calculateCoverTransform({
      containerWidth: shell.clientWidth,
      containerHeight: shell.clientHeight,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      crop: cropRef.current,
    });

    if (nextLayout) setVideoLayout(nextLayout);
  }, []);

  const hideVisual = useCallback((targetGeneration) => {
    if (!isCurrent(targetGeneration)) return;
    resetVisualLatch();
    resetIncompleteSampling();
    onVisualHidden?.({ generation: targetGeneration });
    onPlaybackPaused?.({ generation: targetGeneration, now: now() });
  }, [isCurrent, onPlaybackPaused, onVisualHidden, resetIncompleteSampling, resetVisualLatch]);

  const fail = useCallback((reason, detail, targetGeneration = generation) => {
    if (!isCurrent(targetGeneration) || failedGenerationRef.current === targetGeneration) return;
    failedGenerationRef.current = targetGeneration;
    clearAllTimers();
    resetIncompleteSampling();
    resetVisualLatch();
    onVisualHidden?.({ generation: targetGeneration });
    onPlaybackPaused?.({ generation: targetGeneration, now: now() });
    onFailure?.({ generation: targetGeneration, reason, detail });
  }, [
    clearAllTimers,
    generation,
    isCurrent,
    onFailure,
    onPlaybackPaused,
    onVisualHidden,
    resetIncompleteSampling,
    resetVisualLatch,
  ]);

  const revealVerifiedVideo = useCallback((targetGeneration) => {
    const video = videoRef.current;
    if (
      !isCurrent(targetGeneration)
      || !video
      || video.paused
      || video.ended
      || stableGenerationRef.current !== targetGeneration
      || visualConfirmedGenerationRef.current !== targetGeneration
      || visualGenerationRef.current === targetGeneration
      || !cropRef.current
    ) return;

    visualGenerationRef.current = targetGeneration;
    updateLayout();
    onVisualReady?.({ generation: targetGeneration, now: now(), currentTime: video.currentTime });
  }, [isCurrent, onVisualReady, updateLayout]);

  const finishSampling = useCallback((targetGeneration) => {
    if (!isCurrent(targetGeneration)) return;
    const result = detectStableLetterbox(samplingFramesRef.current);
    if (!result?.safeToDisplay) {
      fail(HERO_FAILURE_REASONS.UNSAFE_VIDEO_FRAME, {
        stage: 'letterbox-detection',
        reason: result?.reason || 'low-confidence',
        confidence: result?.confidence || 0,
      }, targetGeneration);
      return;
    }

    const video = videoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) return;
    cropRef.current = {
      top: result.cropRatios.top * video.videoHeight,
      right: result.cropRatios.right * video.videoWidth,
      bottom: result.cropRatios.bottom * video.videoHeight,
      left: result.cropRatios.left * video.videoWidth,
    };
    updateLayout();
    revealVerifiedVideo(targetGeneration);
  }, [fail, isCurrent, revealVerifiedVideo, updateLayout]);

  const captureFrame = useCallback((targetGeneration) => {
    const video = videoRef.current;
    if (!isCurrent(targetGeneration) || !video || video.paused || video.ended) return;

    try {
      if (!samplingCanvasRef.current) samplingCanvasRef.current = document.createElement('canvas');
      const canvas = samplingCanvasRef.current;
      canvas.width = SAMPLE_WIDTH;
      canvas.height = SAMPLE_HEIGHT;
      const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      context.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      const imageData = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      samplingFramesRef.current.push({
        width: SAMPLE_WIDTH,
        height: SAMPLE_HEIGHT,
        data: imageData.data,
      });
    } catch (error) {
      fail(HERO_FAILURE_REASONS.UNSAFE_VIDEO_FRAME, {
        stage: 'frame-sampling',
        message: error?.message,
      }, targetGeneration);
      return;
    }

    if (samplingFramesRef.current.length >= REQUIRED_FRAME_SAMPLES) {
      clearSamplingCallback();
      finishSampling(targetGeneration);
    }
  }, [clearSamplingCallback, fail, finishSampling, isCurrent]);

  const beginSampling = useCallback((targetGeneration) => {
    const video = videoRef.current;
    if (!video || cropRef.current || sampleCallbackRef.current != null || fallbackSampleTimerRef.current != null) {
      revealVerifiedVideo(targetGeneration);
      return;
    }

    const sampleNextFrame = () => {
      captureFrame(targetGeneration);
      if (
        isCurrent(targetGeneration)
        && samplingFramesRef.current.length < REQUIRED_FRAME_SAMPLES
        && failedGenerationRef.current !== targetGeneration
      ) {
        if (video.requestVideoFrameCallback) {
          sampleCallbackRef.current = video.requestVideoFrameCallback(sampleNextFrame);
        } else {
          fallbackSampleTimerRef.current = window.setTimeout(sampleNextFrame, 90);
        }
      }
    };

    sampleNextFrame();
  }, [captureFrame, isCurrent, revealVerifiedVideo]);

  const syncPlaybackRequest = useCallback((targetGeneration = generation) => {
    const video = videoRef.current;
    const targetSource = source?.src;
    if (
      !video
      || !isCurrent(targetGeneration, targetSource)
      || video.readyState < HTMLMediaElement.HAVE_METADATA
    ) return;

    const commandKey = `${targetGeneration}:${targetSource}`;
    if (requestedCommandRef.current === commandKey) return;
    requestedCommandRef.current = commandKey;
    const safeVolume = Math.max(0, Math.min(1, (Number(volume) || 60) / 100));
    video.muted = Boolean(muted);
    video.defaultMuted = Boolean(muted);
    video.volume = muted ? 0 : safeVolume;
    onPlaybackRequested?.({ generation: targetGeneration, player: video });

    window.clearTimeout(playbackTimeoutRef.current);
    playbackTimeoutRef.current = window.setTimeout(() => {
      fail(HERO_FAILURE_REASONS.TIMEOUT, { stage: 'native-playback-start' }, targetGeneration);
    }, HERO_PLAYBACK_TIMEOUT_MS);

    const playPromise = video.play();
    playPromise?.catch((error) => {
      if (!muted || error?.name === 'NotAllowedError' || /NotAllowedError|interact/i.test(error?.message || '')) {
        onAutoplayBlocked?.(error, { generation: targetGeneration });
        try {
          video.muted = true;
          video.defaultMuted = true;
          video.volume = 0;
          const retryPromise = video.play();
          onMutedFallback?.({ generation: targetGeneration });
          retryPromise?.catch((retryError) => {
            fail(HERO_FAILURE_REASONS.AUTOPLAY_BLOCKED, {
              stage: 'native-autoplay-retry',
              message: retryError?.message,
            }, targetGeneration);
          });
        } catch (fallbackError) {
          fail(HERO_FAILURE_REASONS.AUTOPLAY_BLOCKED, {
            stage: 'native-autoplay',
            message: error?.message,
          }, targetGeneration);
        }
      } else {
        fail(HERO_FAILURE_REASONS.AUTOPLAY_BLOCKED, {
          stage: 'native-autoplay',
          message: error?.message,
        }, targetGeneration);
      }
    });
  }, [fail, generation, isCurrent, muted, volume, onAutoplayBlocked, onMutedFallback, onPlaybackRequested, source?.src]);

  const handlePlayerReady = useCallback(() => {
    const targetGeneration = generation;
    if (!isLoadedCurrent(targetGeneration)) return;
    updateLayout();
    if (readyGenerationRef.current !== targetGeneration) {
      readyGenerationRef.current = targetGeneration;
      onPlayerReady?.({ generation: targetGeneration, player: videoRef.current });
    }
    syncPlaybackRequest(targetGeneration);
  }, [generation, isLoadedCurrent, onPlayerReady, syncPlaybackRequest, updateLayout]);

  const handlePlaying = useCallback(() => {
    const targetGeneration = generation;
    const video = videoRef.current;
    if (!isCurrent(targetGeneration) || !video) return;

    clearBufferingTimers();
    clearVerificationTimers();
    stableGenerationRef.current = null;
    visualConfirmedGenerationRef.current = null;
    visualGenerationRef.current = null;
    onPlaybackPlaying?.({ generation: targetGeneration, now: now(), player: video });
    beginSampling(targetGeneration);

    const firstTime = Number(video.currentTime);
    playingTimerRef.current = window.setTimeout(() => {
      playingTimerRef.current = null;
      const stableVideo = videoRef.current;
      const stableTime = Number(stableVideo?.currentTime);
      if (
        !isCurrent(targetGeneration)
        || !stableVideo
        || stableVideo.paused
        || stableVideo.ended
        || !Number.isFinite(firstTime)
        || !Number.isFinite(stableTime)
        || stableTime <= firstTime
      ) return;

      const confirmedAt = now();
      stableGenerationRef.current = targetGeneration;
      window.clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
      onPlaybackStable?.({
        generation: targetGeneration,
        now: confirmedAt,
        currentTime: stableTime,
      });

      visualTimerRef.current = window.setTimeout(() => {
        visualTimerRef.current = null;
        const visualVideo = videoRef.current;
        const visualTime = Number(visualVideo?.currentTime);
        if (
          !isCurrent(targetGeneration)
          || !visualVideo
          || visualVideo.paused
          || visualVideo.ended
          || stableGenerationRef.current !== targetGeneration
          || !Number.isFinite(visualTime)
          || visualTime <= stableTime
        ) return;

        visualConfirmedGenerationRef.current = targetGeneration;
        revealVerifiedVideo(targetGeneration);
      }, HERO_VISUAL_READY_CONFIRM_MS);
    }, HERO_PLAYING_HYSTERESIS_MS);
  }, [
    beginSampling,
    clearBufferingTimers,
    clearVerificationTimers,
    generation,
    isCurrent,
    onPlaybackPlaying,
    onPlaybackStable,
    revealVerifiedVideo,
  ]);

  const handleWaiting = useCallback(() => {
    const targetGeneration = generation;
    if (!isCurrent(targetGeneration)) return;

    hideVisual(targetGeneration);
    if (bufferingTimerRef.current != null) return;
    bufferingTimerRef.current = window.setTimeout(() => {
      bufferingTimerRef.current = null;
      if (!isCurrent(targetGeneration) || (videoRef.current?.readyState ?? 0) >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
      onBufferingSustained?.({ generation: targetGeneration, now: now() });
      recoveryTimerRef.current = window.setTimeout(() => {
        fail(HERO_FAILURE_REASONS.TIMEOUT, {
          stage: 'native-buffering-recovery',
        }, targetGeneration);
      }, HERO_PLAYBACK_TIMEOUT_MS);
    }, HERO_BUFFERING_HYSTERESIS_MS);
  }, [fail, generation, hideVisual, isCurrent, onBufferingSustained]);

  const handlePause = useCallback(() => {
    if (!isCurrent(generation) || videoRef.current?.ended) return;
    clearBufferingTimers();
    hideVisual(generation);
  }, [clearBufferingTimers, generation, hideVisual, isCurrent]);

  const handleEnded = useCallback(() => {
    const targetGeneration = generation;
    if (!isCurrent(targetGeneration) || !videoRef.current?.ended) return;
    clearAllTimers();
    resetIncompleteSampling();
    resetVisualLatch();
    onVisualHidden?.({ generation: targetGeneration });
    onPlaybackPaused?.({ generation: targetGeneration, now: now() });
    onEnded?.({ generation: targetGeneration });
  }, [
    clearAllTimers,
    generation,
    isCurrent,
    onEnded,
    onPlaybackPaused,
    onVisualHidden,
    resetIncompleteSampling,
    resetVisualLatch,
  ]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateLayout);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [updateLayout]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const safeVolume = Math.max(0, Math.min(1, (Number(volume) || 60) / 100));
    video.muted = Boolean(muted);
    video.defaultMuted = Boolean(muted);
    video.volume = muted ? 0 : safeVolume;
  }, [muted, volume]);

  useEffect(() => {
    cropRef.current = null;
    samplingFramesRef.current = [];
    readyGenerationRef.current = null;
    requestedCommandRef.current = null;
    stableGenerationRef.current = null;
    visualConfirmedGenerationRef.current = null;
    visualGenerationRef.current = null;
    failedGenerationRef.current = null;
    clearSamplingCallback();
    clearAllTimers();

    const video = videoRef.current;
    if (video && enabled && source?.src) video.load();
  }, [clearAllTimers, clearSamplingCallback, enabled, generation, source?.src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!enabled || !source?.src) {
      requestedCommandRef.current = null;
      clearAllTimers();
      resetIncompleteSampling();
      resetVisualLatch();
      unloadVideo(video);
      return;
    }

    if (!active) {
      requestedCommandRef.current = null;
      video.pause();
      clearAllTimers();
      resetIncompleteSampling();
      resetVisualLatch();
      onVisualHidden?.({ generation });
      onPlaybackPaused?.({ generation, now: now() });
      return;
    }

    syncPlaybackRequest(generation);
  }, [
    active,
    clearAllTimers,
    enabled,
    generation,
    onPlaybackPaused,
    onVisualHidden,
    resetIncompleteSampling,
    resetVisualLatch,
    source?.src,
    syncPlaybackRequest,
  ]);

  useEffect(() => () => {
    clearAllTimers();
    clearSamplingCallback();
    unloadVideo(videoRef.current);
  }, [clearAllTimers, clearSamplingCallback]);

  const videoStyle = videoLayout ? {
    width: `${videoLayout.width}px`,
    height: `${videoLayout.height}px`,
    left: `${videoLayout.left}px`,
    top: `${videoLayout.top}px`,
  } : undefined;

  return (
    <div
      ref={shellRef}
      className={`hero-video-shell hero-native-video-shell ${visible ? 'is-visible' : ''}`}
      aria-hidden="true"
      data-video-safe={visible ? 'true' : 'false'}
    >
      <div className="hero-video-frame">
        <video
          ref={videoRef}
          key={`${generation}-${source?.src || ''}`}
          className="hero-native-video"
          style={videoStyle}
          muted={muted}
          playsInline
          preload={enabled ? 'auto' : 'none'}
          crossOrigin="anonymous"
          disablePictureInPicture
          controlsList="nodownload noplaybackrate nofullscreen noremoteplayback"
          tabIndex={-1}
          onLoadedMetadata={handlePlayerReady}
          onCanPlay={handlePlayerReady}
          onPlaying={handlePlaying}
          onWaiting={handleWaiting}
          onStalled={handleWaiting}
          onPause={handlePause}
          onEnded={handleEnded}
          onError={() => fail(HERO_FAILURE_REASONS.VIDEO_ERROR, {
            stage: 'native-player',
            code: videoRef.current?.error?.code,
            message: videoRef.current?.error?.message,
          }, generation)}
        >
          {enabled && source?.src ? <source src={source.src} type={source.mimeType} /> : null}
        </video>
      </div>
    </div>
  );
};

export default React.memo(HeroNativeVideo);
