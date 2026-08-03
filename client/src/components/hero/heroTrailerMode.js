export const getHeroTrailerMode = (
  envMode = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_HERO_TRAILER_MODE : undefined,
) => {
  const normalized = String(envMode || 'hybrid').trim().toLowerCase();
  return ['native', 'section', 'hybrid'].includes(normalized) ? normalized : 'hybrid';
};
