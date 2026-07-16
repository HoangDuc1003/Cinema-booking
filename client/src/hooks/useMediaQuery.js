import { useEffect, useState } from 'react';

const getMatch = (query) => (
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false
);

const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => getMatch(query));

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, [query]);

  return matches;
};

export default useMediaQuery;

