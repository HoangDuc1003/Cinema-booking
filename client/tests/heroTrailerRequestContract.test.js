import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const heroSectionPath = fileURLToPath(
  new URL('../src/components/HeroSection.jsx', import.meta.url),
);
const heroSectionSource = readFileSync(heroSectionPath, 'utf8');

test('Hero resolves a real YouTube trailer through the backend metadata endpoint', () => {
  assert.match(
    heroSectionSource,
    /import\s*\{[^}]*fetchMovieTrailers[^}]*\}\s*from\s*['"]\.\.\/services\/tmdb['"];/s,
    'HeroSection must import fetchMovieTrailers instead of limiting playback to native/dev sources',
  );
  assert.match(
    heroSectionSource,
    /fetchMovieTrailers\(targetMovie,\s*\{\s*signal:\s*controller\.signal\s*\}\)/,
    'The CTA metadata request must use the selected movie and an abort signal',
  );
  assert.match(
    heroSectionSource,
    /trailers\.map\(resolveHeroVideoSource\)\.find\(Boolean\)/,
    'Backend trailer metadata must be normalized into the shared native/YouTube source contract',
  );
});

test('Hero does not route a trailer CTA to TrailerSection', () => {
  assert.doesNotMatch(
    heroSectionSource,
    /scrollIntoView\s*\(/,
    'A Hero trailer click must play inside Hero and must never scroll to TrailerSection',
  );
});
