import { useState, useEffect } from 'react';

/**
 * useDebounce — Delays updating a value until the user stops changing it.
 *
 * WHY: Search inputs fire on every keystroke. Without debounce, each keystroke
 * triggers an API call, causing network spam and race conditions. By waiting
 * until the user pauses (default 300ms), we send only ONE request for the
 * final intended query. This is superior to throttle for search because
 * we only care about the FINAL value, not intermediate ones.
 *
 * @param {*} value - The rapidly-changing value (e.g., search input)
 * @param {number} delay - Milliseconds to wait after last change (default: 300)
 * @returns {*} The debounced value
 */
const useDebounce = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup: cancel the previous timer if value changes before delay expires.
    // This is the core mechanic — only the LAST timer survives.
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
};

export default useDebounce;
