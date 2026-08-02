import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMovieIndex } from '../src/components/hero/heroMovieIndex.js';

test('normalizeMovieIndex wraps indices correctly for 5 movies', () => {
  assert.equal(normalizeMovieIndex(-1, 5), 4);
  assert.equal(normalizeMovieIndex(0, 5), 0);
  assert.equal(normalizeMovieIndex(4, 5), 4);
  assert.equal(normalizeMovieIndex(5, 5), 0);
  assert.equal(normalizeMovieIndex(6, 5), 1);
  assert.equal(normalizeMovieIndex(11, 5), 1);
  assert.equal(normalizeMovieIndex(-6, 5), 4);
});

test('normalizeMovieIndex handles single movie', () => {
  assert.equal(normalizeMovieIndex(0, 1), 0);
  assert.equal(normalizeMovieIndex(1, 1), 0);
  assert.equal(normalizeMovieIndex(-1, 1), 0);
});

test('normalizeMovieIndex returns 0 for empty or invalid totals', () => {
  assert.equal(normalizeMovieIndex(0, 0), 0);
  assert.equal(normalizeMovieIndex(3, 0), 0);
  assert.equal(normalizeMovieIndex(0, -1), 0);
  assert.equal(normalizeMovieIndex(0, 1.5), 0);
  assert.equal(normalizeMovieIndex(0, NaN), 0);
  assert.equal(normalizeMovieIndex(0, undefined), 0);
  assert.equal(normalizeMovieIndex(0, null), 0);
});

test('trailer ended transitions: movie 0->1, penultimate->last, last->0', () => {
  const total = 5;
  // Movie 0 ends -> movie 1
  assert.equal(normalizeMovieIndex(0 + 1, total), 1);
  // Penultimate (3) ends -> last (4)
  assert.equal(normalizeMovieIndex(3 + 1, total), 4);
  // Last (4) ends -> first (0)
  assert.equal(normalizeMovieIndex(4 + 1, total), 0);
});
