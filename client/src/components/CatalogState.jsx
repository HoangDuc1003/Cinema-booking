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
  emptyTitle = 'Chưa có phim để hiển thị',
  emptyDescription = 'Hãy quay lại sau để khám phá những bộ phim mới.',
  emptyIcon: EmptyIcon = Heart,
}) => {
  if (status === 'loading') {
    return (
      <div role="status" aria-live="polite" aria-label="Đang tải danh sách phim">
        <CatalogSkeleton />
        <span className="sr-only">Đang tải danh sách phim…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <section className="catalog-state-panel" role="alert">
        <span className="catalog-state-panel__icon" aria-hidden="true">
          <RefreshCw />
        </span>
        <h2>Chưa thể tải danh sách phim</h2>
        <p>{error?.message || 'Kết nối đến máy chủ đang gián đoạn. Vui lòng thử lại.'}</p>
        <button type="button" className="catalog-state-panel__button" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Thử lại
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
