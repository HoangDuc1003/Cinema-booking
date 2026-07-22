import React, { useId } from 'react';
import { Film } from 'lucide-react';

const CatalogHeader = ({
  icon: Icon = Film,
  eyebrow,
  title,
  description,
  count = 0,
  countLabel = 'titles',
  ariaBusy = false,
  children,
}) => {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={ariaBusy}
      className="catalog-header"
    >
      <div className={`catalog-header__layout ${children ? 'catalog-header__layout--with-aside' : ''}`}>
        <div className="min-w-0">
          <div className="catalog-header__meta">
            <span className="catalog-header__icon">
              <Icon aria-hidden="true" />
            </span>
            {eyebrow && (
              <span className="catalog-header__eyebrow">
                {eyebrow}
              </span>
            )}
            <span className="catalog-header__count">
              {count} {countLabel}
            </span>
          </div>

          <h1 id={titleId} className="catalog-header__title">
            {title}
          </h1>
          {description && (
            <p className="catalog-header__description">
              {description}
            </p>
          )}
        </div>

        {children && <div className="catalog-header__aside">{children}</div>}
      </div>
    </section>
  );
};

export default React.memo(CatalogHeader);
