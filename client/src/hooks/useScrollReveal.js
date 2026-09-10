import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useScrollReveal - reveals a single element the moment it scrolls into view.
 *
 * WHY a shared observer: a grid can hold 50+ cards. One IntersectionObserver per
 * card means 50 observers competing for the same scroll; the browser handles one
 * observer with 50 targets far better. Observers are pooled by their option
 * signature and torn down when the last subscriber unmounts.
 *
 * WHY reveal-once: this drives an entrance animation. Re-running it when the user
 * scrolls back up makes the page feel unstable rather than alive.
 */

const pools = new Map();

const getPool = (threshold, rootMargin) => {
  const poolKey = `${threshold}|${rootMargin}`;
  const existing = pools.get(poolKey);
  if (existing) return existing;

  const callbacks = new WeakMap();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      callbacks.get(entry.target)?.();
    }
  }, { threshold, rootMargin });

  const pool = {
    count: 0,
    observe(element, onReveal) {
      callbacks.set(element, onReveal);
      observer.observe(element);
      pool.count += 1;
    },
    unobserve(element) {
      callbacks.delete(element);
      observer.unobserve(element);
      pool.count -= 1;
      if (pool.count <= 0) {
        observer.disconnect();
        pools.delete(poolKey);
      }
    },
  };
  pools.set(poolKey, pool);
  return pool;
};

const useScrollReveal = ({
  threshold = 0.15,
  rootMargin = '0px 0px -40px 0px',
} = {}) => {
  // Environments without IntersectionObserver (SSR, older browsers, tests) must
  // show the content rather than leave it invisible forever.
  const [isRevealed, setIsRevealed] = useState(() => typeof IntersectionObserver === 'undefined');
  const elementRef = useRef(null);
  const revealedRef = useRef(isRevealed);

  const setRef = useCallback((node) => {
    elementRef.current = node;
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || revealedRef.current || typeof IntersectionObserver === 'undefined') return undefined;

    const pool = getPool(threshold, rootMargin);
    const reveal = () => {
      revealedRef.current = true;
      setIsRevealed(true);
      pool.unobserve(element);
    };
    pool.observe(element, reveal);

    return () => {
      if (!revealedRef.current) pool.unobserve(element);
    };
  }, [rootMargin, threshold]);

  return { ref: setRef, isRevealed };
};

export default useScrollReveal;
