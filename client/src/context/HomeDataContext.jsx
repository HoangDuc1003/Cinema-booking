import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { fetchHomeHero, fetchHomeNowShowing } from '../services/tmdb';

const HomeDataContext = createContext({
  hero: null,
  nowShowing: [],
  heroStatus: 'idle',
  nowShowingStatus: 'idle',
  nowShowingSource: null,
  error: null,
});

export const useHomeData = () => useContext(HomeDataContext);

export const HomeDataProvider = ({ children }) => {
  const [state, setState] = useState({
    hero: null,
    nowShowing: [],
    heroStatus: 'idle',
    nowShowingStatus: 'idle',
    nowShowingSource: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    setState((prev) => ({
      ...prev,
      heroStatus: 'loading',
      nowShowingStatus: 'loading',
      error: null,
    }));

    Promise.allSettled([
      fetchHomeHero({ signal: controller.signal }),
      fetchHomeNowShowing({ limit: 10, signal: controller.signal }),
    ]).then(([heroResult, nowResult]) => {
      if (!alive || controller.signal.aborted) return;
      
      const hero = heroResult.status === 'fulfilled' ? heroResult.value : null;
      let nowShowing = [];
      let source = null;
      let nsStatus = 'error';
      let errorStr = null;

      if (nowResult.status === 'fulfilled') {
        nowShowing = nowResult.value.movies || [];
        source = nowResult.value.source;
        nsStatus = source === 'stale-server-cache' ? 'stale' : 'success';
      } else {
        errorStr = nowResult.reason?.message || 'Now Showing data unavailable';
      }

      setState({
        hero,
        nowShowing,
        heroStatus: heroResult.status === 'fulfilled' ? 'success' : 'error',
        nowShowingStatus: nsStatus,
        nowShowingSource: source,
        error: errorStr,
      });
    });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [state.retryCount]);

  const value = useMemo(() => ({
    ...state,
    retry: () => setState(prev => ({ ...prev, retryCount: (prev.retryCount || 0) + 1 }))
  }), [state]);

  return (
    <HomeDataContext.Provider value={value}>
      {children}
    </HomeDataContext.Provider>
  );
};
