import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('HeroSection preserves the exact five-movie server order in every mode', async () => {
  const heroSectionSource = await readFile(
    new URL('../src/components/HeroSection.jsx', import.meta.url),
    'utf8',
  );

  assert.match(heroSectionSource, /validateMovieCandidates\(orderedMovies, signal\)/);
  assert.match(heroSectionSource, /saveHeroMoviesCache\(preparedMovies,/);
  assert.match(heroSectionSource, /moviesRef\.current = preparedMovies/);
  assert.match(heroSectionSource, /setMovies\(preparedMovies\)/);
  assert.doesNotMatch(heroSectionSource, /getOrComputeDailyOrder|applyDailyOrder|getOrCreateAnonymousViewerId/);
  assert.doesNotMatch(heroSectionSource, /isManualMode|dailyOrderIds|shuffledMovies/);
});
