import { useEffect } from 'react';

/**
 * useBodyScrollLock - keeps the page from scrolling under an overlay.
 *
 * WHY a shared count: the phone menu and the trailer modal each locked the page
 * by saving and restoring `body.style.overflow` on their own. Two overlays that
 * close out of order would then restore each other's "hidden" and leave the
 * page stuck. One count means the lock lifts when the last overlay lets go, and
 * the page gets back whatever overflow it had before the first.
 */

let activeLocks = 0;
let overflowBeforeLock = '';

const useBodyScrollLock = (active) => {
  useEffect(() => {
    if (!active) return undefined;
    if (activeLocks === 0) {
      overflowBeforeLock = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    activeLocks += 1;
    return () => {
      activeLocks -= 1;
      if (activeLocks === 0) document.body.style.overflow = overflowBeforeLock;
    };
  }, [active]);
};

export default useBodyScrollLock;
