import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  HERO_BUFFERING_HYSTERESIS_MS,
  HERO_FAILURE_REASONS,
  HERO_PLAYBACK_TIMEOUT_MS,
  HERO_PLAYING_HYSTERESIS_MS,
} from './heroMachine';
import { calculateCoverTransform, detectStableLetterbox } from './heroVideoCrop';

const SAMPLE_WIDTH = 160;
const SAMPLE_HEIGHT = 90;
const REQUIRED_FRAME_SAMPLES = 12;

const now = () => performance.now();

const HeroNativeVideo = ({
  enabled,
  active,
  visible,
  source,
  generation,
  muted,
  onPlaybackResumed,
  onPlaybackStable,
  onVisualReady,
  onVisualHidden,
  onPlaybackPaused,
  onBufferingSustained,
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
  const bufferingTimerRef = useRef(null);
  const stableGenerationRef = useRef(null);
  const visualGenerationRef = useRef(null);
  const failedGenerationRef = useRef(null);
  const [videoLayout, setVideoLayout] = useState(null);

  useEffect(() => {
    latestRef.current = { enabled, active, source, generation };
  });

  const isCurrent = useCallback((targetGeneration = generation) => {
    const latest = latestRef.current;
    return Boolean(
      latest.enabled
      && latest.active
      && latest.source?.src
      && latest.generation === targetGeneration
    );
  }, [generation]);

  const clearSampling = useCallback(() => {
    const video = videoRef.current;
    if (sampleCallbackRef.current != null && video?.cancelVideoFrameCallback) {
      video.cancelVideoFrameCallback(sampleCallbackRef.current);
    }
    sampleCallbackRef.current = null;
    window.clearTimeout(fallbackSampleTimerRef.current);
    fallbackSampleTimerRef.current = null;
  }, []);

  const clearTimers = useCallback(() => {
    window.clearTimeout(playbackTimeoutRef.current);
    window.clearTimeout(playingTimerRef.current);
    window.clearTimeout(bufferingTimerRef.current);
    playbackTimeoutRef.current = null;
    playingTimerRef.current = null;
    bufferingTimerRef.current = null;
  }, []);

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

  const fail = useCallback((reason, detail, targetGeneration = generation) => {
    if (!isCurrent(targetGeneration) || failedGenerationRef.current === targetGeneration) return;
    failedGenerationRef.current = targetGeneration;
    clearSampling();
    clearTimers();
    onVisualHidden?.({ generation: targetGeneration });
    onPlaybackPaused?.({ generation: targetGeneration, now: now() });
    onFailure?.({ generation: targetGeneration, reason, detail });
  }, [clearSampling, clearTimers, generation, isCurrent, onFailure, onPlaybackPaused, onVisualHidden]);

  const revealVerifiedVideo = useCallback((targetGeneration) => {
    if (
      !isCurrent(targetGeneration)
      || stableGenerationRef.current !== targetGeneration
      || visualGenerationRef.current === targetGeneration
      || !cropRef.current
    ) return;

    visualGenerationRef.current = targetGeneration;
    updateLayout();
    onVisualReady?.({ generation: targetGeneration, now: now() });
  }, [isCurrent, onVisualReady, updateLayout]);

  const finishSampling = useCallback((targetGeneration) => {
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
    cropRef.current = {
      top: result.cropRatios.top * video.videoHeight,
      right: result.cropRatios.right * video.videoWidth,
      bottom: result.cropRatios.bottom * video.videoHeight,
      left: result.cropRatios.left * video.videoWidth,
    };
    updateLayout();
    revealVerifiedVideo(targetGeneration);
  }, [fail, revealVerifiedVideo, updateLayout]);

  const captureFrame = useCallback((targetGeneration) => {
    const video = videoRef.current;
    if (!isCurrent(targetGeneration) || !video || video.paused || video.ended) return;

    try {
      if (!samplingCanvasRef.current) samplingCanvasRef.current = document.createElement('canvas');
      const canvas = samplingCanvasRef.current;
      canvas.width = SAMPLE_WIDTH;
      canvas.height = SAMPLE_HEIGHT;
      const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
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
      clearSampling();
      finishSampling(targetGeneration);
    }
  }, [clearSampling, fail, finishSampling, isCurrent]);

  const beginSampling = useCallback((targetGeneration) => {
    const video = videoRef.current;
    if (!video || samplingFramesRef.current.length > 0 || cropRef.current) return;

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
  }, [captureFrame, isCurrent]);

  const handlePlaying = useCallback(() => {
    const targetGeneration = generation;
    if (!isCurrent(targetGeneration)) return;

    window.clearTimeout(bufferingTimerRef.current);
    bufferingTimerRef.current = null;
    const startedAt = now();
    onPlaybackResumed?.({ generation: targetGeneration, now: startedAt });
    beginSampling(targetGeneration);

    window.clearTimeout(playingTimerRef.current);
    const probeTime = Number(videoRef.current?.currentTime);
    playingTimerRef.current = window.setTimeout(() => {
      playingTimerRef.current = null;
      const video = videoRef.current;
      if (
        !isCurrent(targetGeneration)
        || !video
        || video.paused
        || video.ended
        || !Number.isFinite(probeTime)
        || video.currentTime <= probeTime
      ) return;

      stableGenerationRef.current = targetGeneration;
      window.clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
      onPlaybackStable?.({ generation: targetGeneration, now: startedAt, currentTime: video.currentTime });
      revealVerifiedVideo(targetGeneration);
    }, HERO_PLAYING_HYSTERESIS_MS);
  }, [beginSampling, generation, isCurrent, onPlaybackResumed, onPlaybackStable, revealVerifiedVideo]);

  const handleWaiting = useCallback(() => {
    const targetGeneration = generation;
    if (!isCurrent(targetGeneration)) return;
    window.clearTimeout(playingTimerRef.current);
    playingTimerRef.current = null;
    onPlaybackPaused?.({ generation: targetGeneration, now: now() });

    if (bufferingTimerRef.current != null) return;
    bufferingTimerRef.current = window.setTimeout(() => {
      bufferingTimerRef.current = null;
      if (!isCurrent(targetGeneration) || (videoRef.current?.readyState ?? 0) >= 3) return;
      onVisualHidden?.({ generation: targetGeneration });
      onBufferingSustained?.({ generation: targetGeneration });
    }, HERO_BUFFERING_HYSTERESIS_MS);
  }, [generation, isCurrent, onBufferingSustained, onPlaybackPaused, onVisualHidden]);

  const handlePause = useCallback(() => {
    if (!isCurrent(generation) || videoRef.current?.ended) return;
    onPlaybackPaused?.({ generation, now: now() });
  }, [generation, isCurrent, onPlaybackPaused]);

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
    video.muted = muted;
    video.volume = muted ? 0 : 1;
  }, [muted]);

  useEffect(() => {
    cropRef.current = null;
    samplingFramesRef.current = [];
    stableGenerationRef.current = null;
    visualGenerationRef.current = null;
    failedGenerationRef.current = null;
    clearSampling();
    clearTimers();
  }, [clearSampling, clearTimers, generation, source?.src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !enabled || !source?.src) return undefined;

    if (!active) {
      video.pause();
      clearSampling();
      clearTimers();
      onVisualHidden?.({ generation });
      onPlaybackPaused?.({ generation, now: now() });
      return undefined;
    }

    playbackTimeoutRef.current = window.setTimeout(() => {
      fail(HERO_FAILURE_REASONS.TIMEOUT, { stage: 'native-playback' }, generation);
    }, HERO_PLAYBACK_TIMEOUT_MS);

    const playPromise = video.play();
    playPromise?.catch((error) => {
      fail(HERO_FAILURE_REASONS.AUTOPLAY_BLOCKED, { message: error?.message }, generation);
    });

    return undefined;
  }, [active, clearSampling, clearTimers, enabled, fail, generation, onPlaybackPaused, onVisualHidden, source]);

  useEffect(() => () => {
    clearSampling();
    clearTimers();
  }, [clearSampling, clearTimers]);

  const videoStyle = videoLayout ? {
    width: `${videoLayout.width}px`,
    height: `${videoLayout.height}px`,
    left: `${videoLayout.left}px`,
    top: `${videoLayout.top}px`,
  } : undefined;

  return (
    <div
      ref={shellRef}
      className={`hero-video-shell ${visible ? 'is-visible' : ''}`}
      aria-hidden="true"
      data-video-safe={visible ? 'true' : 'false'}
    >
      <div className="hero-video-frame">
        <video
          ref={videoRef}
          key={`${generation}-${source?.src || ''}`}
          className="hero-native-video"
          src={source?.src}
          style={videoStyle}
          muted={muted}
          playsInline
          preload="auto"
          crossOrigin="anonymous"
          disablePictureInPicture
          controlsList="nodownload noplaybackrate nofullscreen noremoteplayback"
          tabIndex={-1}
          onLoadedMetadata={updateLayout}
          onPlaying={handlePlaying}
          onWaiting={handleWaiting}
          onStalled={handleWaiting}
          onPause={handlePause}
          onEnded={() => onEnded?.({ generation })}
          onError={() => fail(HERO_FAILURE_REASONS.VIDEO_ERROR, {
            code: videoRef.current?.error?.code,
            message: videoRef.current?.error?.message,
          }, generation)}
        />
      </div>
    </div>
  );
};

export default React.memo(HeroNativeVideo);
