import React, { useState, useEffect } from 'react'
import { Film } from 'lucide-react'
import { fetchNowPlayingMovies } from '../services/tmdb'
import Loading from '../components/Loading'
import MovieGrid from '../components/MovieGrid'
import { dummyShowsData } from '../assets/assets'
import CatalogHeader from '../components/CatalogHeader'
import CatalogPageShell from '../components/CatalogPageShell'
  
const Theater = () => {
  const [movies, setMovies] = useState(() => dummyShowsData.slice(0, 10));
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadMovies = async () => {
      try {
        const data = await fetchNowPlayingMovies();
        if (mounted) setMovies(Array.isArray(data) && data.length ? data : dummyShowsData.slice(0, 10));
      } catch (error) {
        if (error.name !== 'AbortError' && import.meta.env.DEV) console.warn('Theater load error:', error.message);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    loadMovies();
    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading && !movies.length) return <Loading />;

  return (
    <CatalogPageShell
      header={(
        <CatalogHeader
          icon={Film}
          eyebrow="Playing now"
          title="Now in Theaters"
          description="Browse films currently lighting up the big screen and choose the next showtime for your cinema night."
          count={movies.length}
          countLabel="movies"
        />
      )}
    >
      <MovieGrid
        movies={movies}
        columns="grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        animated={true}
        staggerDelay={10}
      />
    </CatalogPageShell>
  );
}

export default Theater;
