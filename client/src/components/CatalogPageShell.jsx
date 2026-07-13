import React from 'react';
import AmbientGlow from './AmbientGlow';

const CatalogPageShell = ({ header, children }) => (
  <div className="catalog-page-shell relative isolate min-h-screen overflow-x-clip px-4 pb-12 pt-24 sm:px-6 sm:pt-28 md:px-8 lg:pt-30 xl:px-12">
    <AmbientGlow variant="page" />
    <div className="relative z-10 mx-auto w-full max-w-[1360px]">
      {header}
      <div className="mt-8 sm:mt-10">{children}</div>
    </div>
  </div>
);

export default React.memo(CatalogPageShell);
