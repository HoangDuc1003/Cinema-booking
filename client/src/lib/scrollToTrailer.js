// Ordered best-to-worst: the player itself is 16:9 and centres nicely, the
// section is the whole block, and #trailers is the lazy wrapper that always
// exists even before the section has mounted.
const TARGET_SELECTORS = ['.trailer-player', '#home-trailer-section', '#trailers'];

// How long to keep watching for the lazily-mounted player before giving up.
const SETTLE_TIMEOUT_MS = 2500;

const findTarget = () => {
  for (const selector of TARGET_SELECTORS) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
};

/**
 * Scrolls so `element` sits in the middle of the viewport. An element taller
 * than the viewport is aligned to the top instead, because centring it would
 * push its own top edge off screen.
 */
export const centerInViewport = (element, behavior = 'smooth') => {
  const rect = element.getBoundingClientRect();
  const spare = Math.max(0, (window.innerHeight - rect.height) / 2);
  const top = Math.max(0, window.scrollY + rect.top - spare);
  window.scrollTo({ top, behavior });
};

/**
 * Sends the viewer from the Hero down to the trailer, centred.
 *
 * The trailer section is mounted lazily, so the first scroll usually only
 * reaches the placeholder. That scroll is what brings the section into view and
 * makes it mount, so we watch briefly and re-centre once on the real player.
 */
export const scrollToTrailer = ({ reducedMotion = false } = {}) => {
  const first = findTarget();
  if (!first) return false;

  const behavior = reducedMotion ? 'auto' : 'smooth';
  centerInViewport(first, behavior);

  const startedAt = Date.now();
  const settle = () => {
    const player = document.querySelector('.trailer-player') || document.querySelector('#home-trailer-section');
    if (player && player !== first) {
      centerInViewport(player, behavior);
      return;
    }
    if (Date.now() - startedAt < SETTLE_TIMEOUT_MS) window.requestAnimationFrame(settle);
  };
  window.requestAnimationFrame(settle);
  return true;
};

export default scrollToTrailer;
