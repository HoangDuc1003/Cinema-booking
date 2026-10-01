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
  assert.match(navbar, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(navbar, /closeButtonRef\.current\?\.focus/);
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
  assert.match(seat, /useEffect\(\(\) => \{ seatClickRef\.current = handleSeatClick \}\)/);
  assert.match(seat, /onClick=\{onSeatClick\}/);
  // The old comparator ignored `onClick`, which is what pinned stale closures.
  assert.doesNotMatch(seat, /prev\.status === next\.status && prev\.showPrice === next\.showPrice/);
});

test('phones check out from a sticky bar and seat taps do not stack toasts', () => {
  const seat = read('pages/SeatLayout.jsx');

  assert.match(seat, /seat-checkout-bar lg:hidden sticky bottom-0/);
  assert.match(seat, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(seat, /toast\.success\(`Seat/);
  assert.equal((seat.match(/id: 'seat-feedback'/g) || []).length, 4);
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
