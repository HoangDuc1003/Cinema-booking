import React, { useState, useEffect } from 'react'
import { CalendarDays } from 'lucide-react'
import { fetchUpcomingMovies } from '../services/tmdb'
import MovieGrid from '../components/MovieGrid'
import Loading from '../components/Loading'
import { dummyShowsData } from '../assets/assets'
import CatalogHeader from '../components/CatalogHeader'
import CatalogPageShell from '../components/CatalogPageShell'

const Release = () => {
  const [movies, setMovies] = useState(() => dummyShowsData.slice(0, 10));
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadMovies = async () => {
      try {
        const data = await fetchUpcomingMovies();
        if (mounted) setMovies(Array.isArray(data) && data.length ? data : dummyShowsData.slice(0, 10));
      } catch (error) {
        if (error.name !== 'AbortError' && import.meta.env.DEV) console.warn('Release load error:', error.message);
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
          icon={CalendarDays}
          eyebrow="Coming soon"
          title="Upcoming Releases"
          description="Preview the films arriving next and keep your watchlist ready for their first big-screen showings."
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
};

export default Release;
