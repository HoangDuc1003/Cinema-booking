import React, { useCallback } from 'react';
import CatalogHeader from './CatalogHeader';
import CatalogPageShell from './CatalogPageShell';
import CatalogState from './CatalogState';
import MovieGrid from './MovieGrid';
import useCatalogFeed from '../hooks/useCatalogFeed';

const CatalogCollectionPage = ({
  icon,
  eyebrow,
  title,
  description,
  fetchMovies,
  emptyTitle,
  emptyDescription,
}) => {
  const loadMovies = useCallback(({ signal }) => fetchMovies({
    signal,
    fallbackMode: 'none',
  }), [fetchMovies]);
  const { movies, status, error, retry } = useCatalogFeed(loadMovies);

  return (
    <CatalogPageShell
      header={(
        <CatalogHeader
          icon={icon}
          eyebrow={eyebrow}
          title={title}
          description={description}
          count={status === 'ready' ? movies.length : 0}
          countLabel="movies"
          ariaBusy={status === 'loading'}
        />
      )}
    >
      {status !== 'ready' ? (
        <CatalogState status={status} error={error} onRetry={retry} />
      ) : movies.length ? (
        <MovieGrid movies={movies} />
      ) : (
        <CatalogState
          status="empty"
          emptyIcon={icon}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
        />
      )}
    </CatalogPageShell>
  );
};

export default React.memo(CatalogCollectionPage);
