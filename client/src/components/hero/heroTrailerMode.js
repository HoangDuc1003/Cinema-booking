export const HERO_TRAILER_MODES = Object.freeze({
  NATIVE: 'native',
  SECTION: 'section',
  HYBRID: 'hybrid',
});

const VALID_MODES = new Set(Object.values(HERO_TRAILER_MODES));

export const getHeroTrailerMode = (
  envMode = typeof window !== 'undefined' && window.__E2E_TRAILER_MODE
    ? window.__E2E_TRAILER_MODE
    : typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_HERO_TRAILER_MODE
      : undefined,
) => {
  if (envMode === undefined || envMode === null || String(envMode).trim() === '') {
    return HERO_TRAILER_MODES.NATIVE;
  }

  const normalized = String(envMode).trim().toLowerCase();

  if (VALID_MODES.has(normalized)) {
    return normalized;
  }

  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
    console.warn(`[getHeroTrailerMode] Unknown trailer mode "${envMode}", defaulting to "${HERO_TRAILER_MODES.NATIVE}".`);
  }

  return HERO_TRAILER_MODES.NATIVE;
};

