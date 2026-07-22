import React, { useCallback } from 'react'
import { CalendarDays } from 'lucide-react'
import { fetchUpcomingMovies } from '../services/tmdb'
import MovieGrid from '../components/MovieGrid'
import CatalogHeader from '../components/CatalogHeader'
import CatalogPageShell from '../components/CatalogPageShell'
import CatalogState from '../components/CatalogState'
import useCatalogFeed from '../hooks/useCatalogFeed'

const Release = () => {
  const loadMovies = useCallback(({ signal }) => fetchUpcomingMovies({
    signal,
    fallbackMode: 'none',
  }), []);
  const { movies, status, error, retry } = useCatalogFeed(loadMovies);

  return (
    <CatalogPageShell
      header={(
        <CatalogHeader
          icon={CalendarDays}
          eyebrow="Coming soon"
          title="Upcoming Releases"
          description="Preview the films arriving next and keep your watchlist ready for their first big-screen showings."
          count={status === 'ready' ? movies.length : 0}
          countLabel="movies"
          ariaBusy={status === 'loading'}
        />
      )}
    >
      {status !== 'ready' ? (
        <CatalogState status={status} error={error} onRetry={retry} />
      ) : movies.length ? (
        <MovieGrid movies={movies} columns="grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" staggerDelay={30} />
      ) : (
        <CatalogState status="empty" emptyIcon={CalendarDays} emptyTitle="Chưa có lịch phát hành" emptyDescription="Các phim sắp ra mắt sẽ xuất hiện tại đây." />
      )}
    </CatalogPageShell>
  );
};

export default Release;
