import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useIntersectionObserver — Detects when an element enters the viewport.
 *
 * WHY Intersection Observer over scroll events:
 * 1. PERFORMANCE: IO runs off the main thread (browser-native), scroll events
 *    fire 60+ times/sec on main thread causing jank.
 * 2. NO MANUAL MATH: No getBoundingClientRect() calculations.
 * 3. BATTERY: IO is idle when nothing intersects; scroll listeners are always active.
 *
 * WHY triggerOnce defaults to true:
 * For entrance animations, we only want the fade-up to happen ONCE. Re-triggering
 * on scroll back up would feel jarring and break user mental model.
 *
 * @param {Object} options
 * @param {number} options.threshold - % of element visible to trigger (0-1, default: 0.1)
 * @param {string} options.rootMargin - Offset from viewport edge (default: '0px 0px -50px 0px')
 * @param {boolean} options.triggerOnce - Only trigger once then disconnect (default: true)
 * @returns {{ ref: React.RefObject, isVisible: boolean }}
 */
const useIntersectionObserver = ({
  threshold = 0.1,
  rootMargin = '0px 0px -50px 0px',
  triggerOnce = true,
} = {}) => {
  const elementRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const observerRef = useRef(null);

  const cleanup = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // Avoid creating a new observer if already visible and triggerOnce
    if (triggerOnce && isVisible) return;

    cleanup();

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          // Disconnect immediately after first trigger to free resources
          if (triggerOnce) {
            cleanup();
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );

    observerRef.current.observe(element);

    return cleanup;
  }, [threshold, rootMargin, triggerOnce, isVisible, cleanup]);

  return { ref: elementRef, isVisible };
};

export default useIntersectionObserver;
