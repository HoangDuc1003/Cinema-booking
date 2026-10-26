import { useCallback } from 'react';

/**
 * useEdgeSwipeGuard - stops a sideways swipe on a horizontal scroller from
 * turning into the browser's back/forward gesture.
 *
 * WHY: a scroller that is already at its edge cannot scroll any further, so the
 * browser does not latch the swipe to it, and `overscroll-behavior-x: contain`
 * never applies. The swipe goes to the page instead, and on phones that means
 * history back (right swipe at the start) or forward (left swipe at the end).
 * Cancelling only that touchmove keeps the gesture on the page. Every other
 * swipe is left to the browser, so the scroller still scrolls, vertical swipes
 * still scroll the page, and pinch-zoom still works.
 *
 * Returns a callback ref to put on the scroller in place of `ref`. It keeps
 * `ref.current` pointing at the element, and because it is a ref callback (React
 * 19 runs its returned cleanup), the listeners follow the element: a replaced or
 * remounted scroller gets them again, an unmounted one loses them. The callback
 * is stable, so a re-render never re-adds listeners.
 *
 * @param {{ current: HTMLElement | null }} [ref] optional object ref that other
 *   code reads (scroll position, scrollTo); kept in sync with the element
 * @returns {(node: HTMLElement | null) => (() => void) | undefined}
 */
const useEdgeSwipeGuard = (ref) => useCallback((rail) => {
  if (ref) ref.current = rail;
  if (!rail) return undefined;

  let start = null;

  const onTouchStart = (event) => {
    const touch = event.touches[0];
    start = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const onTouchMove = (event) => {
    if (!start || event.touches.length !== 1 || !event.cancelable) return;
    const touch = event.touches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Vertical or undecided: the page scrolls as usual.
    if (Math.abs(dx) <= Math.abs(dy)) return;

    const maxScroll = rail.scrollWidth - rail.clientWidth;
    // In RTL, scrollLeft runs from 0 at the right edge down to -maxScroll.
    const rtl = getComputedStyle(rail).direction === 'rtl';
    const fromLeft = rtl ? rail.scrollLeft + maxScroll : rail.scrollLeft;
    const atLeftEdge = fromLeft <= 1;
    const atRightEdge = fromLeft >= maxScroll - 1;

    // A right swipe reveals content to the left, a left swipe content to the right.
    if ((dx > 0 && atLeftEdge) || (dx < 0 && atRightEdge)) event.preventDefault();
  };

  const reset = () => { start = null; };

  rail.addEventListener('touchstart', onTouchStart, { passive: true });
  // Non-passive: the only way to cancel the gesture the browser would take.
  rail.addEventListener('touchmove', onTouchMove, { passive: false });
  rail.addEventListener('touchend', reset, { passive: true });
  rail.addEventListener('touchcancel', reset, { passive: true });
  return () => {
    rail.removeEventListener('touchstart', onTouchStart);
    rail.removeEventListener('touchmove', onTouchMove);
    rail.removeEventListener('touchend', reset);
    rail.removeEventListener('touchcancel', reset);
    // With a cleanup returned, React does not call the ref with null itself.
    if (ref && ref.current === rail) ref.current = null;
  };
}, [ref]);

export default useEdgeSwipeGuard;
