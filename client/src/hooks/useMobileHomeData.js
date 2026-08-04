import { useEffect, useMemo, useState } from 'react';
import {
import { fetchPopularMovies, fetchUpcomingMovies } from '../services/tmdb';
import { useHomeData } from '../context/HomeDataContext';

const initialState = {
  hero: null,
  nowShowing: [],
  popular: [],
  upcoming: [],
  criticalStatus: 'idle',
  secondaryStatus: 'idle',
  error: '',
};

const useMobileHomeData = ({ enabled = true } = {}) => {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let alive = true;
    let deferredTimer;
    queueMicrotask(() => {
      if (alive) setState((current) => ({ ...current, criticalStatus: 'loading', error: '' }));
    });

    Promise.allSettled([
      fetchPopularMovies({ pages: 1, maxAdult: 2, signal: controller.signal }),
      fetchUpcomingMovies({ signal: controller.signal }),
    ]).then(([popularResult, upcomingResult]) => {
      if (!alive || controller.signal.aborted) return;
      setState((current) => ({
        ...current,
        popular: popularResult.status === 'fulfilled' ? popularResult.value : [],
        upcoming: upcomingResult.status === 'fulfilled' ? upcomingResult.value : [],
        secondaryStatus: 'settled',
      }));
    });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [enabled]);

  const { hero, nowShowing, heroStatus, nowShowingStatus, error: homeError } = useHomeData();

  return useMemo(() => ({
    ...state,
    hero,
    nowShowing,
    criticalReady: heroStatus === 'success' || nowShowingStatus === 'success' || nowShowingStatus === 'stale',
    featured: hero?.movies?.[0] || nowShowing[0] || null,
    recommendations: hero?.movies?.slice(1) || [],
    error: homeError || state.error,
  }), [state, hero, nowShowing, heroStatus, nowShowingStatus, homeError]);
};

export default useMobileHomeData;
