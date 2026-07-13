import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cssPath = fileURLToPath(new URL('../src/components/hero/hero.css', import.meta.url));
const css = readFileSync(cssPath, 'utf8');
const indexPath = fileURLToPath(new URL('../index.html', import.meta.url));
const indexHtml = readFileSync(indexPath, 'utf8');

const VIEWPORTS = Object.freeze([
  { name: 'mobile portrait', width: 390, height: 844 },
  { name: 'iPhone landscape', width: 844, height: 390 },
  { name: 'iPad portrait', width: 1024, height: 768 },
  { name: 'iPad landscape', width: 1366, height: 1024 },
  { name: 'desktop', width: 1920, height: 1080 },
]);

const extractBalancedBlock = (source, openingBraceIndex) => {
  let depth = 0;

  for (let index = openingBraceIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] !== '}') continue;
    depth -= 1;
    if (depth === 0) return source.slice(openingBraceIndex + 1, index);
  }

  throw new Error(`Unclosed CSS block at offset ${openingBraceIndex}`);
};

const ruleBodies = (source, selector) => {
  const matcher = /([^{}]+)\{/g;
  const bodies = [];
  let match;

  while ((match = matcher.exec(source)) !== null) {
    const selectorList = match[1].trim();
    if (selectorList.startsWith('@')) continue;
    if (!selectorList.split(',').some((candidate) => candidate.trim() === selector)) continue;

    const openingBraceIndex = matcher.lastIndex - 1;
    bodies.push(extractBalancedBlock(source, openingBraceIndex));
  }

  return bodies;
};

const declarations = (body, property) => {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...body.matchAll(new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*([^;]+)`, 'g'))]
    .map((match) => match[1].trim());
};

const mediaBlocks = () => {
  const matcher = /@media\s*([^{]+)\{/g;
  const blocks = [];
  let match;

  while ((match = matcher.exec(css)) !== null) {
    const openingBraceIndex = css.indexOf('{', match.index);
    blocks.push({
      query: match[1].trim(),
      body: extractBalancedBlock(css, openingBraceIndex),
    });
  }

  return blocks;
};

const mediaApplies = (query, viewport) => {
  if (/orientation\s*:\s*landscape/i.test(query) && viewport.width <= viewport.height) return false;
  if (/orientation\s*:\s*portrait/i.test(query) && viewport.height <= viewport.width) return false;

  const limits = [...query.matchAll(/(min|max)-(width|height)\s*:\s*(\d+)px/gi)];
  return limits.every(([, boundary, axis, rawLimit]) => {
    const actual = viewport[axis.toLowerCase()];
    const limit = Number(rawLimit);
    return boundary.toLowerCase() === 'min' ? actual >= limit : actual <= limit;
  });
};

const resolveViewportLength = (value, viewport) => {
  if (value === '100dvh' || value === '100vh') return viewport.height;
  if (value === '100dvw' || value === '100vw' || value === '100%') return viewport.width;
  return Number.NaN;
};

test('viewport metadata enables safe-area layout on edge-to-edge devices', () => {
  const viewportMeta = indexHtml.match(/<meta\s+name=["']viewport["']\s+content=["']([^"']+)["']/i);
  assert.ok(viewportMeta, 'Expected a viewport meta tag');
  assert.match(viewportMeta[1], /width\s*=\s*device-width/i);
  assert.match(viewportMeta[1], /initial-scale\s*=\s*1(?:\.0)?/i);
  assert.match(viewportMeta[1], /viewport-fit\s*=\s*cover/i,
    'viewport-fit=cover is required for env(safe-area-inset-*) on notched devices');
});

test('Hero height tracks the dynamic viewport instead of the small Safari viewport', () => {
  const baseRule = ruleBodies(css, '.hero-section')[0];
  assert.ok(baseRule, 'Expected a base .hero-section rule');

  const heights = declarations(baseRule, 'height');
  const minHeights = declarations(baseRule, 'min-height');

  assert.ok(heights.includes('100vh'), 'Hero needs a 100vh fallback for older browsers');
  assert.equal(heights.at(-1), '100dvh', '100dvh must be the winning Hero height');
  assert.ok(minHeights.includes('100vh'), 'Hero needs a 100vh min-height fallback');
  assert.equal(minHeights.at(-1), '100dvh', '100dvh must be the winning Hero min-height');
  for (const heroRule of ruleBodies(css, '.hero-section')) {
    assert.notEqual(declarations(heroRule, 'height').at(-1), '100svh');
    assert.notEqual(declarations(heroRule, 'min-height').at(-1), '100svh');
  }

  for (const viewport of VIEWPORTS) {
    assert.equal(resolveViewportLength(heights.at(-1), viewport), viewport.height,
      `${viewport.name} must resolve 100dvh to its full ${viewport.height}px viewport height`);
  }
});

test('Hero remains full-width and clips media at every target viewport', () => {
  const baseRule = ruleBodies(css, '.hero-section')[0];
  assert.equal(declarations(baseRule, 'width').at(-1), '100%');
  assert.equal(declarations(baseRule, 'max-width').at(-1), 'none');
  assert.ok(['hidden', 'clip'].includes(declarations(baseRule, 'overflow').at(-1)));

  for (const viewport of VIEWPORTS) {
    assert.equal(resolveViewportLength(declarations(baseRule, 'width').at(-1), viewport), viewport.width,
      `${viewport.name} Hero must cover all ${viewport.width}px horizontally`);
  }
});

test('short landscape phones receive an explicit compact layout contract', () => {
  const landscapeViewport = VIEWPORTS.find(({ name }) => name === 'iPhone landscape');
  const portraitViewport = VIEWPORTS.find(({ name }) => name === 'mobile portrait');
  const matchingBlock = mediaBlocks().find(({ query }) => (
    /max-height\s*:/i.test(query)
    && mediaApplies(query, landscapeViewport)
    && !mediaApplies(query, portraitViewport)
  ));

  assert.ok(matchingBlock,
    'Expected a short-landscape media query that applies at 844x390 but not 390x844');

  const contentRule = ruleBodies(matchingBlock.body, '.hero-content-zone')[0];
  assert.ok(contentRule, 'Short landscape mode must resize .hero-content-zone');
  assert.equal(declarations(contentRule, 'min-height').at(-1), '0',
    'The desktop 18rem minimum causes navbar overlap on short screens');

  const overviewRule = ruleBodies(matchingBlock.body, '.hero-overview')[0];
  assert.ok(overviewRule, 'Short landscape mode must define overview behavior');
  assert.equal(declarations(overviewRule, 'display').at(-1), 'none',
    'Overview must not push actions into the navbar on a 390px-tall viewport');

  const titleRule = ruleBodies(matchingBlock.body, '.hero-title')[0];
  assert.ok(declarations(titleRule, 'font-size').length > 0,
    'Short landscape mode must reduce the Hero title size');
});
