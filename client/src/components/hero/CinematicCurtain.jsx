import { useEffect } from 'react';

const CURTAIN_REMOVAL_DELAY_MS = 500;

/**
 * Decorative screen-reader-hidden theatre curtain used while a YouTube player
 * reaches verified playback. The parent removes it only after the open state
 * has remained visible long enough for its exit animation to settle.
 *
 * @param {{ state: 'closed' | 'opening' | 'open', onRevealComplete: () => void }} props
 */
const CinematicCurtain = ({ state, onRevealComplete }) => {
  useEffect(() => {
    if (state !== 'open') return undefined;

    const timerId = window.setTimeout(onRevealComplete, CURTAIN_REMOVAL_DELAY_MS);
    return () => window.clearTimeout(timerId);
  }, [onRevealComplete, state]);

  return (
    <div
      aria-hidden="true"
      className={`hero-curtain-overlay is-${state}`}
    >
      <div className="hero-curtain-panel hero-curtain-left">
        <div className="hero-curtain-sheen" />
      </div>
      <div className="hero-curtain-panel hero-curtain-right">
        <div className="hero-curtain-sheen" />
      </div>
      <div className="hero-curtain-valance" />
    </div>
  );
};

export default CinematicCurtain;
