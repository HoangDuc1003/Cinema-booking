import React from 'react';
import { Heart, RefreshCw } from 'lucide-react';

const CatalogSkeleton = ({ count = 10 }) => (
  <div className="catalog-state-grid" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => (
      <div className="catalog-card-skeleton" key={index}>
        <span className="catalog-card-skeleton__art" />
        <span className="catalog-card-skeleton__line" />
        <span className="catalog-card-skeleton__line is-short" />
      </div>
    ))}
  </div>
);

const CatalogState = ({
  status,
  error,
  onRetry,
  emptyTitle = 'No movies to display',
  emptyDescription = 'Check back later to discover new movies.',
  emptyIcon: EmptyIcon = Heart,
}) => {
  if (status === 'loading') {
    return (
      <div role="status" aria-live="polite" aria-label="Loading movie catalog">
        <CatalogSkeleton />
        <span className="sr-only">Loading movie catalog…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <section className="catalog-state-panel" role="alert">
        <span className="catalog-state-panel__icon" aria-hidden="true">
          <RefreshCw />
        </span>
        <h2>Unable to load movies</h2>
        <p>{error?.message || 'The server connection was interrupted. Please try again.'}</p>
        <button type="button" className="catalog-state-panel__button" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Try again
        </button>
      </section>
    );
  }

  return (
    <section className="catalog-state-panel catalog-state-panel--empty">
      <span className="catalog-state-panel__icon" aria-hidden="true">
        <EmptyIcon />
      </span>
      <h2>{emptyTitle}</h2>
      <p>{emptyDescription}</p>
    </section>
  );
};

export { CatalogSkeleton };
export default React.memo(CatalogState);
