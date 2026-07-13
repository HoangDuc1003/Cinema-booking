import React, { useId } from 'react';
import { Film } from 'lucide-react';
import AmbientGlow from './AmbientGlow';

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
      className="catalog-header relative isolate overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f1d]/92 shadow-[0_28px_90px_rgba(0,0,0,0.32)]"
    >
      <AmbientGlow variant="header" />
      <div
        className="catalog-header__pattern pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: 'repeating-linear-gradient(115deg, #fff 0, #fff 1px, transparent 1px, transparent 18px)',
        }}
      />

      <div className={`relative z-10 grid gap-6 p-5 sm:p-7 lg:p-9 ${children ? 'lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] lg:items-end' : 'sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end'}`}>
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="catalog-header__icon flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/25 bg-primary/12 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:h-12 sm:w-12">
              <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </span>
            {eyebrow && (
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/90 sm:text-xs">
                {eyebrow}
              </span>
            )}
            <span className="catalog-header__count rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium text-gray-300">
              {count} {countLabel}
            </span>
          </div>

          <h1 id={titleId} className="catalog-header__title text-[1.85rem] font-black leading-[1.08] tracking-[-0.035em] text-white sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400 sm:text-base sm:leading-7">
              {description}
            </p>
          )}
        </div>

        {children || (
          <div className="catalog-header__summary hidden min-w-40 rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-right backdrop-blur-sm sm:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">Collection</p>
            <p className="mt-1 text-lg font-semibold text-white">{count} {countLabel}</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default React.memo(CatalogHeader);
