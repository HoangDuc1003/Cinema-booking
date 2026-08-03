import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getOrComputeDailyOrder } from '../src/utils/heroDailyShuffle.js';

test('R3: getOrComputeDailyOrder returns exact server order when mode is manual', () => {
  const movies = [
    { _id: 'm1', title: 'Movie 1' },
    { _id: 'm2', title: 'Movie 2' },
    { _id: 'm3', title: 'Movie 3' },
    { _id: 'm4', title: 'Movie 4' },
    { _id: 'm5', title: 'Movie 5' },
  ];

  // Test mode: 'manual'
  const resultMode = getOrComputeDailyOrder({
    movies,
    meta: { mode: 'manual', dateKey: '2026-08-03' },
    viewerKey: 'viewer-abc',
  });
  assert.deepEqual(resultMode, ['m1', 'm2', 'm3', 'm4', 'm5']);

  // Test configuredMode: 'manual'
  const resultConfigured = getOrComputeDailyOrder({
    movies,
    meta: { configuredMode: 'manual', dateKey: '2026-08-03' },
    viewerKey: 'viewer-abc',
  });
  assert.deepEqual(resultConfigured, ['m1', 'm2', 'm3', 'm4', 'm5']);

  // Test effectiveMode: 'manual'
  const resultEffective = getOrComputeDailyOrder({
    movies,
    meta: { effectiveMode: 'manual', dateKey: '2026-08-03' },
    viewerKey: 'viewer-abc',
  });
  assert.deepEqual(resultEffective, ['m1', 'm2', 'm3', 'm4', 'm5']);

  // Test source: 'manual-selection'
  const resultSource = getOrComputeDailyOrder({
    movies,
    meta: { source: 'manual-selection', dateKey: '2026-08-03' },
    viewerKey: 'viewer-abc',
  });
  assert.deepEqual(resultSource, ['m1', 'm2', 'm3', 'm4', 'm5']);
});

test('R3: HeroSection contains manual mode shuffle bypass check', async () => {
  const heroSectionSource = await readFile(
    new URL('../src/components/HeroSection.jsx', import.meta.url),
    'utf8'
  );

  assert.match(heroSectionSource, /isManualMode/);
  assert.match(heroSectionSource, /mode === 'manual'|configuredMode === 'manual'/);
  assert.match(heroSectionSource, /!isManualMode\s*\?\s*getOrComputeDailyOrder/);
});
