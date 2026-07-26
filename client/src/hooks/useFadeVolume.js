import { useCallback, useEffect, useRef } from 'react';

/**
 * Smoothly ramps a YouTube IFrame Player's volume and clears an active ramp
 * when the owning component unmounts or starts a new reveal.
 *
 * @returns {{ fadeIn: (player: object | null, options?: { from?: number, to?: number, duration?: number, onComplete?: () => void, onError?: (error: unknown) => void }) => boolean, cancelFade: () => void }}
 */
const useFadeVolume = () => {
  const frameRef = useRef(null);

  const cancelFade = useCallback(() => {
    if (frameRef.current != null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const fadeIn = useCallback((player, {
    from = 0,
    to = 60,
    duration = 800,
    onComplete,
    onError,
  } = {}) => {
    cancelFade();
    if (!player) return false;

    const startVolume = Math.max(0, Math.min(100, Number(from) || 0));
    const targetVolume = Math.max(0, Math.min(100, Number(to) || 0));
    const safeDuration = Math.max(0, Number(duration) || 0);

    try {
      player.setVolume?.(startVolume);
      player.unMute?.();
    } catch (error) {
      onError?.(error);
      return false;
    }

    if (safeDuration === 0 || startVolume === targetVolume) {
      try {
        player.setVolume?.(targetVolume);
      } catch (error) {
        onError?.(error);
        return false;
      }
      onComplete?.();
      return true;
    }

    const startedAt = performance.now();
    const step = (timestamp) => {
      const progress = Math.min(1, (timestamp - startedAt) / safeDuration);
      const nextVolume = Math.round(startVolume + ((targetVolume - startVolume) * progress));

      try {
        player.setVolume?.(nextVolume);
      } catch (error) {
        cancelFade();
        onError?.(error);
        return;
      }

      if (progress === 1) {
        cancelFade();
        onComplete?.();
        return;
      }
      frameRef.current = window.requestAnimationFrame(step);
    };
    frameRef.current = window.requestAnimationFrame(step);
    return true;
  }, [cancelFade]);

  useEffect(() => cancelFade, [cancelFade]);

  return { fadeIn, cancelFade };
};

export default useFadeVolume;
