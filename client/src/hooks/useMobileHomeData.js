import { useEffect, useMemo, useState } from 'react';
import {
  fetchHomeHero,
  fetchHomeNowShowing,
  fetchPopularMovies,
  fetchUpcomingMovies,
} from '../services/tmdb';

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
      fetchHomeHero({ signal: controller.signal }),
      fetchHomeNowShowing({ limit: 12, signal: controller.signal }),
    ]).then(([heroResult, nowResult]) => {
      if (!alive || controller.signal.aborted) return;
      const hero = heroResult.status === 'fulfilled' ? heroResult.value : null;
      const nowShowing = nowResult.status === 'fulfilled' ? nowResult.value : [];
      setState((current) => ({
        ...current,
        hero,
        nowShowing,
        criticalStatus: 'settled',
        error: !hero && !nowShowing.length ? 'Movie data is not available yet.' : '',
      }));

      deferredTimer = window.setTimeout(() => {
        setState((current) => ({ ...current, secondaryStatus: 'loading' }));
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
      }, 50);
    });

    return () => {
      alive = false;
      controller.abort();
      window.clearTimeout(deferredTimer);
    };
  }, [enabled]);

  return useMemo(() => ({
    ...state,
    criticalReady: state.criticalStatus === 'settled',
    featured: state.hero?.movies?.[0] || state.nowShowing[0] || null,
    recommendations: state.hero?.movies?.slice(1) || [],
  }), [state]);
};

export default useMobileHomeData;
