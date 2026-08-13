import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchHomeHero, fetchHomeNowShowing } from '../services/tmdb';
import { getInitialHeroPayload } from '../components/hero/heroCatalogLoader';
import { readHomeNowShowingCache } from '../services/homeNowShowingCache';

const HomeDataContext = createContext({
  hero: null,
  nowShowing: [],
  heroStatus: 'idle',
  heroError: null,
  nowShowingStatus: 'idle',
  nowShowingError: null,
  nowShowingSource: null,
  retryHero: () => {},
  retryNowShowing: () => {},
  retry: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export const useHomeData = () => useContext(HomeDataContext);

export const HomeDataProvider = ({ children }) => {
  const [initialHero] = useState(() => getInitialHeroPayload());
  const [initialNowShowing] = useState(() => readHomeNowShowingCache());
  const [heroRetryCount, setHeroRetryCount] = useState(0);
  const [nowShowingRetryCount, setNowShowingRetryCount] = useState(0);
  const [state, setState] = useState(() => ({
    hero: initialHero,
    nowShowing: initialNowShowing?.movies || [],
    heroStatus: initialHero ? 'stale' : 'loading',
    heroError: null,
    nowShowingStatus: initialNowShowing ? 'stale' : 'loading',
    nowShowingError: null,
    nowShowingSource: initialNowShowing?.source || null,
  }));

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    fetchHomeHero({ signal: controller.signal }).then((hero) => {
      if (!alive || controller.signal.aborted) return;
      setState((previous) => ({
        ...previous,
        hero,
        heroStatus: 'success',
        heroError: null,
      }));
    }).catch((error) => {
      if (!alive || controller.signal.aborted || error?.name === 'AbortError') return;
      setState((previous) => ({
        ...previous,
        heroStatus: previous.hero ? 'stale' : 'error',
        heroError: error,
      }));
    });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [heroRetryCount]);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    fetchHomeNowShowing({ limit: 10, signal: controller.signal }).then((result) => {
      if (!alive || controller.signal.aborted) return;
      setState((previous) => ({
        ...previous,
        nowShowing: result.movies || [],
        nowShowingStatus: result.source === 'stale-server-cache' || result.meta?.stale === true ? 'stale' : 'success',
        nowShowingSource: result.meta?.source || result.source || null,
        nowShowingError: result.error || null,
      }));
    }).catch((error) => {
      if (!alive || controller.signal.aborted || error?.name === 'AbortError') return;
      setState((previous) => ({
        ...previous,
        nowShowingStatus: previous.nowShowing.length ? 'stale' : 'error',
        nowShowingError: error,
      }));
    });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [nowShowingRetryCount]);

  const retryHero = useCallback(() => {
    setState((previous) => ({ ...previous, heroStatus: previous.hero ? 'stale' : 'loading', heroError: null }));
    setHeroRetryCount((count) => count + 1);
  }, []);

  const retryNowShowing = useCallback(() => {
    setState((previous) => ({
      ...previous,
      nowShowingStatus: previous.nowShowing.length ? 'stale' : 'loading',
      nowShowingError: null,
    }));
    setNowShowingRetryCount((count) => count + 1);
  }, []);

  const retry = useCallback(() => {
    retryHero();
    retryNowShowing();
  }, [retryHero, retryNowShowing]);

  const value = useMemo(() => ({
    ...state,
    error: state.nowShowingError?.message || state.heroError?.message || null,
    retryHero,
    retryNowShowing,
    retry,
  }), [retry, retryHero, retryNowShowing, state]);

  return (
    <HomeDataContext.Provider value={value}>
      {children}
    </HomeDataContext.Provider>
  );
};
