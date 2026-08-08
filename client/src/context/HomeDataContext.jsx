import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchHomeHero, fetchHomeNowShowing } from '../services/tmdb';
import { getInitialHeroPayload } from '../components/hero/heroCatalogLoader';

const HomeDataContext = createContext({
  hero: null,
  nowShowing: [],
  heroStatus: 'idle',
  nowShowingStatus: 'idle',
  nowShowingSource: null,
  error: null,
});

// eslint-disable-next-line react-refresh/only-export-components
export const useHomeData = () => useContext(HomeDataContext);

export const HomeDataProvider = ({ children }) => {
  const [state, setState] = useState(() => ({
    hero: getInitialHeroPayload(),
    nowShowing: [],
    heroStatus: 'loading',
    nowShowingStatus: 'loading',
    nowShowingSource: null,
    error: null,
    retryCount: 0,
  }));

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

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

      setState((previous) => ({
        ...previous,
        hero: hero || previous.hero,
        nowShowing,
        heroStatus: heroResult.status === 'fulfilled'
          ? 'success'
          : (previous.hero ? 'stale' : 'error'),
        nowShowingStatus: nsStatus,
        nowShowingSource: source,
        error: errorStr,
      }));
    });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [state.retryCount]);

  const retry = useCallback(() => setState((previous) => ({
    ...previous,
    heroStatus: 'loading',
    nowShowingStatus: 'loading',
    error: null,
    retryCount: previous.retryCount + 1,
  })), []);

  const value = useMemo(() => ({ ...state, retry }), [retry, state]);

  return (
    <HomeDataContext.Provider value={value}>
      {children}
    </HomeDataContext.Provider>
  );
};
