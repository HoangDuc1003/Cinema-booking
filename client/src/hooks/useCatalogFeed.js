import { useCallback, useEffect, useState } from 'react';

const initialState = {
  movies: [],
  status: 'loading',
  error: null,
};

const useCatalogFeed = (loadMovies) => {
  const [state, setState] = useState(initialState);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // The request version is only changed by an explicit retry, so resetting here
    // represents a new request rather than deriving state from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ movies: [], status: 'loading', error: null });

    Promise.resolve(loadMovies({ signal: controller.signal }))
      .then((movies) => {
        if (controller.signal.aborted) return;
        setState({
          movies: Array.isArray(movies) ? movies : [],
          status: 'ready',
          error: null,
        });
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === 'AbortError') return;
        setState({ movies: [], status: 'error', error });
      });

    return () => controller.abort();
  }, [loadMovies, requestVersion]);

  const retry = useCallback(() => {
    setRequestVersion((version) => version + 1);
  }, []);

  return {
    ...state,
    isLoading: state.status === 'loading',
    retry,
  };
};

export default useCatalogFeed;
