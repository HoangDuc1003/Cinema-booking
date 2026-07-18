import { useCallback, useEffect, useRef } from 'react';

const DEFAULT_INTERVAL_MS = 50;

/**
 * Smoothly ramps a YouTube IFrame Player's volume and clears an active ramp
 * when the owning component unmounts or starts a new reveal.
 *
 * @returns {{ fadeIn: (player: object | null, options?: { from?: number, to?: number, duration?: number, onComplete?: () => void }) => void, cancelFade: () => void }}
 */
const useFadeVolume = () => {
  const intervalRef = useRef(null);

  const cancelFade = useCallback(() => {
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fadeIn = useCallback((player, {
    from = 0,
    to = 60,
    duration = 800,
    onComplete,
  } = {}) => {
    cancelFade();
    if (!player) return;

    const startVolume = Math.max(0, Math.min(100, Number(from) || 0));
    const targetVolume = Math.max(0, Math.min(100, Number(to) || 0));
    const safeDuration = Math.max(0, Number(duration) || 0);

    try {
      player.setVolume?.(startVolume);
      player.unMute?.();
    } catch {
      return;
    }

    if (safeDuration === 0 || startVolume === targetVolume) {
      try {
        player.setVolume?.(targetVolume);
      } catch {
        return;
      }
      onComplete?.();
      return;
    }

    const startedAt = Date.now();
    intervalRef.current = window.setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / safeDuration);
      const nextVolume = Math.round(startVolume + ((targetVolume - startVolume) * progress));

      try {
        player.setVolume?.(nextVolume);
      } catch {
        cancelFade();
        return;
      }

      if (progress === 1) {
        cancelFade();
        onComplete?.();
      }
    }, DEFAULT_INTERVAL_MS);
  }, [cancelFade]);

  useEffect(() => cancelFade, [cancelFade]);

  return { fadeIn, cancelFade };
};

export default useFadeVolume;
