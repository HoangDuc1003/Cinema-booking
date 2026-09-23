import React, { useEffect, useRef, useState } from 'react';

// Long enough that flicking through posters never starts a download.
const START_DELAY_MS = 1_600;
// A trailer that has not drawn a frame by now stays a poster.
const READY_TIMEOUT_MS = 8_000;
const FADE_OUT_MS = 700;

/**
 * A muted, chrome-free trailer layered over the Hero poster.
 *
 * The <video> has no `controls` attribute, so the browser never draws any UI on
 * it: there is no play button or title bar to flash, which is the whole reason
 * this is not a YouTube embed. It stays invisible until a real frame has been
 * painted, so the poster hands over without a black frame.
 *
 * Nothing is fetched until the slide has been on screen for START_DELAY_MS, and
 * unmounting detaches the source so the browser stops downloading at once.
 */
const HeroTrailerVideo = ({
  src,
  type,
  zoom = 1,
  playing,
  muted,
  onVisibleChange,
  onFinish,
  onFail,
  onSoundBlocked,
}) => {
  const videoRef = useRef(null);
  const finishTimerRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [ending, setEnding] = useState(false);

  // Latest callbacks without re-running the effects that own the element.
  const handlersRef = useRef({ onVisibleChange, onFinish, onFail, onSoundBlocked });
  useEffect(() => {
    handlersRef.current = { onVisibleChange, onFinish, onFail, onSoundBlocked };
  });

  useEffect(() => {
    handlersRef.current.onVisibleChange?.(visible && !ending);
  }, [ending, visible]);

  // Attach the source only after the delay.
  useEffect(() => {
    if (started || !playing) return undefined;
    const timer = window.setTimeout(() => setStarted(true), START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [playing, started]);

  // Play, pause, and give up if no frame arrives in time.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !started) return undefined;
    if (!playing) {
      video.pause();
      return undefined;
    }

    let cancelled = false;
    const readyTimer = window.setTimeout(() => {
      if (!cancelled) handlersRef.current.onFail?.('timeout');
    }, READY_TIMEOUT_MS);
    const markReady = () => {
      window.clearTimeout(readyTimer);
      if (!cancelled) setVisible(true);
    };

    // Prefer the callback that fires once a frame is actually composited;
    // 'playing' can fire a moment before anything is on screen.
    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(markReady);
    } else {
      video.addEventListener('playing', markReady, { once: true });
    }
    const fail = (error) => {
      // A pause racing play() rejects with AbortError; that is not a failure.
      if (!cancelled && error?.name !== 'AbortError') handlersRef.current.onFail?.(error?.name || 'play');
    };
    video.play().catch((error) => {
      // The viewer turned sound on, but this browser only autoplays muted video.
      // Keep the trailer and drop to muted rather than falling back to the poster.
      if (!cancelled && error?.name === 'NotAllowedError' && !video.muted) {
        video.muted = true;
        handlersRef.current.onSoundBlocked?.();
        video.play().catch(fail);
        return;
      }
      fail(error);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(readyTimer);
      video.removeEventListener('playing', markReady);
    };
  }, [playing, started]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, started]);

  // Stop the download and free the decoder when the slide goes away. The parent
  // is told the trailer is gone however it left (slide change, resize, failure),
  // and a pending end-of-trailer advance is dropped so it cannot override a
  // slide the viewer has just picked.
  useEffect(() => () => {
    window.clearTimeout(finishTimerRef.current);
    handlersRef.current.onVisibleChange?.(false);
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }, []);

  const handleEnded = () => {
    setEnding(true);
    window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = window.setTimeout(() => handlersRef.current.onFinish?.(), FADE_OUT_MS);
  };

  return (
    <video
      ref={videoRef}
      // Setting src (rather than adding a <source> later) makes the browser start
      // loading on its own; a late <source> would need an explicit load().
      src={started ? src : undefined}
      data-type={type}
      className={`hero-trailer-video ${visible && !ending ? 'is-visible' : ''}`}
      // Crops black bars baked into letterboxed trailers.
      style={zoom > 1 ? { '--hero-trailer-zoom': zoom } : undefined}
      muted={muted}
      playsInline
      preload="none"
      disablePictureInPicture
      disableRemotePlayback
      tabIndex={-1}
      aria-hidden="true"
      onEnded={handleEnded}
      onError={() => {
        if (started) handlersRef.current.onFail?.('error');
      }}
    />
  );
};

export default HeroTrailerVideo;
