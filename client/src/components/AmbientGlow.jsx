import React from 'react';

const VARIANTS = new Set(['page', 'header', 'section']);

const AmbientGlow = ({ variant = 'page', className = '' }) => {
  const safeVariant = VARIANTS.has(variant) ? variant : 'page';
  return (
    <div
      className={`ambient-glow ambient-glow--${safeVariant} ${className}`.trim()}
      aria-hidden="true"
    />
  );
};

export default React.memo(AmbientGlow);
