import React from 'react';
import BlurCircle from './BlurCircle';

const CatalogPageShell = ({ header, children }) => (
  <div className="catalog-page-shell min-h-screen overflow-x-clip px-4 pb-12 pt-24 sm:px-6 sm:pt-28 md:px-8 lg:pt-30 xl:px-12">
    {/* Decorative blur circles — restores the ambient glow background */}
    <BlurCircle top="-80px" right="-60px" />
    <BlurCircle top="350px" left="-80px" delay="0.6s" />
    <BlurCircle top="700px" right="-100px" delay="1.2s" />
    <div
      className="absolute -z-100 w-[28rem] h-[28rem] rounded-full blur-3xl animate-float-blob"
      style={{
        top: '120px',
        left: '-40px',
        background: 'rgba(37, 71, 180, 0.35)',
        animationDelay: '1.8s',
      }}
      aria-hidden="true"
    />
    <div className="mx-auto w-full max-w-7xl">
      {header}
      <div className="mt-7 sm:mt-9">{children}</div>
    </div>
  </div>
);

export default React.memo(CatalogPageShell);

