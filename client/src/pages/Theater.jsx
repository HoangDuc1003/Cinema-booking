import React, { useCallback } from 'react'
import { Film } from 'lucide-react'
import { fetchNowPlayingMovies } from '../services/tmdb'
import MovieGrid from '../components/MovieGrid'
import CatalogHeader from '../components/CatalogHeader'
import CatalogPageShell from '../components/CatalogPageShell'
import CatalogState from '../components/CatalogState'
import useCatalogFeed from '../hooks/useCatalogFeed'
  
const Theater = () => {
  const loadMovies = useCallback(({ signal }) => fetchNowPlayingMovies({
    signal,
    fallbackMode: 'none',
  }), []);
  const { movies, status, error, retry } = useCatalogFeed(loadMovies);

  return (
    <CatalogPageShell
      header={(
        <CatalogHeader
          icon={Film}
          eyebrow="Playing now"
          title="Now in Theaters"
          description="Browse films currently lighting up the big screen and choose the next showtime for your cinema night."
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
        <CatalogState status="empty" emptyIcon={Film} emptyTitle="Chưa có suất chiếu" emptyDescription="Lịch phim tại rạp sẽ sớm được cập nhật." />
      )}
    </CatalogPageShell>
  );
}

export default Theater;
