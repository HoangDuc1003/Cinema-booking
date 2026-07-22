import React from 'react';

const CatalogPageShell = ({ header, children }) => (
  <div className="catalog-page-shell min-h-screen overflow-x-clip px-4 pb-12 pt-24 sm:px-6 sm:pt-28 md:px-8 lg:pt-30 xl:px-12">
    <div className="mx-auto w-full max-w-7xl">
      {header}
      <div className="mt-7 sm:mt-9">{children}</div>
    </div>
  </div>
);

export default React.memo(CatalogPageShell);
