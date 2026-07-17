import { useEffect, useState } from 'react';

export const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(query).matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handleChange = (event) => setMatches(event.matches);
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, [query]);

  return matches;
};

export const useSaveData = () => {
  const [saveData, setSaveData] = useState(() => Boolean(navigator.connection?.saveData));

  useEffect(() => {
    const connection = navigator.connection;
    if (!connection) return undefined;
    const handleChange = () => setSaveData(Boolean(connection.saveData));
    connection.addEventListener?.('change', handleChange);
    return () => connection.removeEventListener?.('change', handleChange);
  }, []);

  return saveData;
};
