import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

// The body of the first `selector {` rule (selectors are matched literally).
const ruleBody = (css, selector) => {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing rule ${selector}`);
  return css.slice(start, css.indexOf('}', start));
};

const keyframes = (css, name) => {
  const start = css.indexOf(`@keyframes ${name} {`);
  assert.notEqual(start, -1, `missing @keyframes ${name}`);
  let depth = 0;
  for (let index = css.indexOf('{', start); index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(start, index + 1);
  }
  return css.slice(start);
};

test('ambient glows are a static gradient, not a moving blur filter', () => {
  const css = read('index.css');
  const circle = read('components/BlurCircle.jsx');
  const shell = read('components/CatalogPageShell.jsx');

  assert.match(circle, /className="blur-circle animate-float-blob"/);
  assert.doesNotMatch(circle, /blur-3xl/);
  assert.doesNotMatch(shell, /blur-3xl/);
  assert.match(ruleBody(css, '.blur-circle::before'), /radial-gradient/);
  assert.doesNotMatch(ruleBody(css, '.blur-circle'), /filter/);
  assert.doesNotMatch(ruleBody(css, '.blur-circle::before'), /filter/);
});

test('decorative loops only run on desktop pointers with motion allowed', () => {
  const css = read('index.css');
  const gate = '@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {';
  const gated = css.slice(css.indexOf(gate));

  assert.notEqual(css.indexOf(gate), -1);
  // The only place the drift and the band pulse are switched on is inside the gate.
  assert.equal(css.split('animation: float-blob').length - 1, 1);
  assert.equal(css.split('animation: slowPulseBand').length - 1, 1);
  assert.match(gated.slice(0, 400), /\.animate-float-blob \{\s*animation: float-blob/);
  assert.match(gated.slice(0, 400), /\.animate-slow-pulse \{\s*animation: slowPulseBand/);
});

test('phones reveal grid cards without animating a filter', () => {
  const css = read('index.css');

  assert.doesNotMatch(keyframes(css, 'catalog-card-enter-lite'), /filter/);
  assert.match(css, /@media \(hover: none\), \(max-width: 767px\) \{\s*\.catalog-grid-item\.is-entering \{\s*animation-name: catalog-card-enter-lite;/);
});

test('touch screens get instant taps and press feedback', () => {
  const css = read('index.css');

  assert.match(css, /-webkit-tap-highlight-color: transparent;/);
  assert.match(css, /touch-action: manipulation;/);
  assert.match(css, /@media \(hover: none\) \{\s*\.tap-press \{/);
  assert.match(css, /scale\(var\(--movie-card-scale, 1\)\)/);
});

test('the phone menu slides with transform and opacity only, and locks the page behind it', () => {
  const navbar = read('components/Navbar.jsx');

  assert.doesNotMatch(navbar, /max-md:w-0/);
  assert.doesNotMatch(navbar, /transition-all duration-500 ease-out/);
  assert.match(navbar, /max-md:transition-\[translate,opacity\]/);
  assert.match(navbar, /useBodyScrollLock\(isOpen\)/);
  assert.match(navbar, /closeButtonRef\.current\?\.focus/);
  // Tab stays inside the open menu, and leaving it by a link hands focus back.
  assert.match(navbar, /onKeyDown=\{keepFocusInMenu\}/);
  assert.match(navbar, /if \(isOpen\) closeMenu\(\{ restoreFocus: true \}\)/);
  // No backdrop blur under a phone's scrolling page; desktop keeps the frosted bar.
  assert.match(navbar, /md:backdrop-blur-md/);
  assert.doesNotMatch(navbar, /'py-3 bg-black\/60 backdrop-blur-md/);
});

test('the Now Showing rail never re-renders React on scroll and snaps card by card', () => {
  const feature = read('components/FeatureSection.jsx');

  assert.doesNotMatch(feature, /setScrollProgress/);
  assert.match(feature, /requestAnimationFrame\(paintProgress\)/);
  assert.match(feature, /bar\.style\.transform = `scaleX\(/);
  assert.match(feature, /snap-x snap-mandatory/);
  assert.match(feature, /overscroll-x-contain/);
});

test('selected seats glow on the compositor and no longer inject keyframes', () => {
  const seat = read('pages/SeatLayout.jsx');
  const css = read('index.css');

  assert.doesNotMatch(seat, /<style>/);
  assert.doesNotMatch(seat, /sync-pulse|sync-glow|blur-xl sync|blur-md sync/);
  const glow = keyframes(css, 'seat-glow');
  assert.doesNotMatch(glow, /box-shadow|filter/);
  assert.match(glow, /opacity/);
  assert.match(glow, /transform/);
  assert.match(ruleBody(css, '.seat.is-selected::after'), /animation: seat-glow/);
});

test('memoised seats call the current click handler, not the one from their first render', () => {
  const seat = read('pages/SeatLayout.jsx');

  assert.match(seat, /const seatClickRef = useRef\(handleSeatClick\)/);
  assert.match(seat, /useLayoutEffect\(\(\) => \{ seatClickRef\.current = handleSeatClick \}\)/);
  assert.match(seat, /onClick=\{onSeatClick\}/);
  // The old comparator ignored `onClick`, which is what pinned stale closures.
  assert.doesNotMatch(seat, /prev\.status === next\.status && prev\.showPrice === next\.showPrice/);
});

test('phones check out from a sticky bar and seat taps do not stack toasts', () => {
  const seat = read('pages/SeatLayout.jsx');

  assert.match(seat, /seat-checkout-bar lg:hidden sticky bottom-0/);
  assert.match(seat, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(seat, /toast\.success\(`Seat/);
  assert.equal((seat.match(/id: 'seat-feedback'/g) || []).length, 5);
});

test('the Hero pauses its loops off screen and drops frosted glass on phones', () => {
  const hero = read('components/HeroSection.jsx');
  const content = read('components/hero/HeroContent.jsx');
  const css = read('components/hero/hero.css');
  const phone = css.slice(css.indexOf('@media (max-width: 767px) {'));

  assert.match(hero, /inView \? '' : 'is-offscreen'/);
  assert.match(css, /\.hero-section\.is-offscreen \.hero-poster,\s*\.hero-section\.is-offscreen \.hero-media__breath \{\s*animation-play-state: paused;/);
  assert.doesNotMatch(content, /will-change-transform/);
  assert.match(phone, /\.hero-action \{[^}]*min-height: 2\.75rem;/);
  assert.match(phone, /\.hero-action--trailer,\s*\.hero-control \{[^}]*backdrop-filter: none;/);
  assert.match(phone, /\.hero-transition-flare \{[^}]*filter: none;/);
});

test('the checkout total is rounded to cents, the way the server charges it', () => {
  const seat = read('pages/SeatLayout.jsx');
  const server = readFileSync(new URL('../../server/services/seatService.js', import.meta.url), 'utf8');

  assert.match(server, /return Math\.round\(total \* 100\) \/ 100;/);
  assert.match(seat, /return Math\.round\(total \* 100\) \/ 100;/);
  assert.doesNotMatch(seat, /return Math\.round\(total\);/);
});

test('API calls wait for Clerk only for a bounded time while it is still loading', () => {
  const context = read('context/AppContext.jsx');

  assert.match(context, /const CLERK_LOAD_GRACE_MS = 3000/);
  assert.match(context, /Promise\.race\(\[tokenRequest\.catch\(\(\) => null\), timeout\]\)\.finally\(\(\) => clearTimeout\(timer\)\)/);
  // A loaded Clerk still gets the full wait, so signed-in requests keep their token.
  assert.match(context, /if \(authLoadedRef\.current\) \{\s*token = await getToken\(\);/);
  assert.match(context, /token = await tokenWithin\(getToken\(\), CLERK_LOAD_GRACE_MS\);/);
  // Only the first request pays the grace period; after that, no more waits.
  assert.match(context, /if \(!authLoadedRef\.current\) clerkWaitExpiredRef\.current = true;/);
  assert.match(context, /else if \(!clerkWaitExpiredRef\.current\)/);
});

test('overlays share one counted scroll lock', () => {
  const hook = read('hooks/useBodyScrollLock.js');
  const modal = read('components/MovieTrailerModal.jsx');
  const navbar = read('components/Navbar.jsx');

  assert.match(hook, /if \(activeLocks === 0\) \{\s*overflowBeforeLock = document\.body\.style\.overflow;/);
  assert.match(hook, /activeLocks -= 1;\s*if \(activeLocks === 0\) document\.body\.style\.overflow = overflowBeforeLock;/);
  assert.match(modal, /useBodyScrollLock\(open\)/);
  for (const source of [modal, navbar]) {
    assert.doesNotMatch(source, /document\.body\.style\.overflow/);
  }
});

test('prices are shown to the cent, from one pricing rule', () => {
  const seat = read('pages/SeatLayout.jsx');

  const bookings = read('pages/MyBookings.jsx');
  assert.match(seat, /import \{ formatPrice \} from '\.\.\/lib\/formatPrice'/);
  assert.match(bookings, /import \{ formatPrice \} from '\.\.\/lib\/formatPrice'/);
  assert.doesNotMatch(bookings, /\{currency\}\{/);
  // The total sums the same per-seat rule the labels use.
  assert.match(seat, /sum \+ seatPriceFor\(rowConfig\.type, showPrice\)/);
  assert.doesNotMatch(seat, /total \+= showPrice \* (2|1\.5)/);
  // No raw number is printed as money any more.
  assert.doesNotMatch(seat, /\$\$\{calculateTotal\}|\$\{item\.price\}|`\$\$\{showPrice\}`/);
});

test('changing the showtime drops seats picked for the previous one', () => {
  const seat = read('pages/SeatLayout.jsx');
  const start = seat.indexOf('const handleTimeSelect = (time) => {');
  const handler = seat.slice(start, seat.indexOf('setSelectedTime(time)', start));

  assert.match(handler, /showIdOf\(time\) !== showIdOf\(selectedTime\)/);
  assert.match(handler, /setSelectedSeats\(\[\]\)/);
  assert.match(handler, /setOccupiedSeats\(\[\]\)/);
  assert.match(handler, /setShowPrice\(0\)/);
});

test('press feedback never overrides an element\'s own transitions', () => {
  const css = read('index.css');
  const layer = css.slice(css.indexOf('@layer components {'));

  assert.notEqual(css.indexOf('@layer components {'), -1);
  assert.match(layer.slice(0, 300), /\.tap-press \{\s*transition: scale 140ms/);
  assert.match(layer.slice(0, 400), /\.tap-press:active \{\s*scale: 0\.96;/);
});

test('the rail indicator is repainted on resize as well as on scroll', () => {
  const feature = read('components/FeatureSection.jsx');

  assert.match(feature, /window\.addEventListener\('resize', handleScroll, \{ passive: true \}\)/);
  assert.match(feature, /window\.removeEventListener\('resize', handleScroll\)/);
});

test('white-on-pink buttons use the AA fill and grey text stays readable on black', () => {
  const css = read('index.css');
  const navbar = read('components/Navbar.jsx');
  const footer = read('components/Footer.jsx');

  assert.match(css, /--nitro-accent-fill: #d63854;/);
  assert.match(ruleBody(css, '.movie-card__cta'), /background: var\(--nitro-accent-fill\);/);
  assert.match(ruleBody(css, '.catalog-state-panel__button'), /background: var\(--nitro-accent-fill\);/);
  assert.match(navbar, /bg-primary-dull hover:bg-\[#c22d48\][^']*'>Login</);
  assert.doesNotMatch(footer, /text-gray-500/);
});

test('the trailer thumbnails control an element that is always rendered', () => {
  const trailer = read('components/TrailerSection.jsx');

  assert.match(trailer, /<div id=\{`\$\{sectionId\}-player`\}>\s*\{loading \?/);
  assert.equal((trailer.match(/id=\{`\$\{sectionId\}-player`\}/g) || []).length, 1);
});

test('loading states animate on the compositor only', () => {
  const css = read('index.css');

  for (const name of ['catalog-shimmer', 'trailer-modal-pulse', 'trailer-modal-ring']) {
    assert.doesNotMatch(keyframes(css, name), /background-position|box-shadow|filter/, name);
    assert.match(keyframes(css, name), /transform/, name);
  }
  assert.match(ruleBody(css, '.catalog-card-skeleton__art::after'), /animation: catalog-shimmer/);
  assert.doesNotMatch(ruleBody(css, '.trailer-modal__pulse'), /backdrop-filter/);
});
