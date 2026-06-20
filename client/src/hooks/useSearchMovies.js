import { useState, useEffect, useRef } from 'react';
import useDebounce from './useDebounce';
import { searchMovies as fetchSearchMovies } from '../services/tmdb';

// In-memory cache for search results — survives re-renders but not page reload.
// WHY in-memory vs sessionStorage: Search results change frequently and are
// user-session specific. In-memory is faster (no serialization) and auto-cleans.
const searchCache = new Map();
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

/**
 * useSearchMovies — Complete search solution with debounce + AbortController + cache.
 *
 * ARCHITECTURE DECISIONS:
 * 1. AbortController: Cancels in-flight requests when user types more characters.
 *    Without this, a slow "Spider" request could return AFTER a fast "Spiderman"
 *    request, showing stale results (race condition).
 * 2. Debounce 300ms: Industry standard for search-as-you-type. Fast enough to
 *    feel responsive, slow enough to avoid API spam.
 * 3. In-memory cache: Avoids re-fetching when user types "bat" → "batman" → "bat"
 *    (common backspace pattern).
 * 4. Minimum 2 characters: TMDB returns garbage for single-char queries.
 *
 * @param {string} query - Raw search input from user
 * @param {number} debounceDelay - Debounce delay in ms (default: 300)
 * @returns {{ results, isSearching, searchError }}
 */
const useSearchMovies = (query, debounceDelay = 300) => {
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const debouncedQuery = useDebounce(query, debounceDelay);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    // Guard: empty or too-short query → clear results immediately
    if (!debouncedQuery || debouncedQuery.trim().length < 2) {
      return;
    }

    const normalizedQuery = debouncedQuery.trim().toLowerCase();

    // Check in-memory cache first
    const cached = searchCache.get(normalizedQuery);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      let active = true;
      queueMicrotask(() => {
        if (!active) return;
        setResults(cached.data);
        setIsSearching(false);
      });
      return () => { active = false; };
    }

    // Abort previous in-flight request — this is the KEY to preventing race conditions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const searchMovies = async () => {
      setIsSearching(true);
      setSearchError(null);

      try {
        const mapped = await fetchSearchMovies(debouncedQuery, { signal: controller.signal });

        // Only update state if this request wasn't aborted
        if (!controller.signal.aborted) {
          setResults(mapped);
          // Cache the result
          searchCache.set(normalizedQuery, { data: mapped, timestamp: Date.now() });
        }
      } catch (err) {
        // AbortError is expected — user typed more chars, so we cancelled this request.
        // Don't treat it as an error.
        if (err.name !== 'AbortError') {
          setSearchError(err.message);
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    };

    searchMovies();

    // Cleanup: abort on unmount or when debouncedQuery changes
    return () => {
      controller.abort();
    };
  }, [debouncedQuery]);

  if (!debouncedQuery || debouncedQuery.trim().length < 2) {
    return { results: [], isSearching: false, searchError: null };
  }

  return { results, isSearching, searchError };
};

export default useSearchMovies;
