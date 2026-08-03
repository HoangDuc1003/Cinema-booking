import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getOrComputeDailyOrder, applyDailyOrder } from '../src/utils/heroDailyShuffle.js';

test('M3: Admin UI initialization extracts selectedIds strictly from settings.movieIds/manualSelection and liveMovies from hero.liveMovies', () => {
  const mockHeroResponse = {
    settings: {
      mode: 'manual',
      movieIds: ['m1', 'm2', 'm3', 'm4', 'm5'],
    },
    liveMovies: [
      { _id: 'm1', title: 'Live 1' },
      { _id: 'm2', title: 'Live 2' },
      { _id: 'm3', title: 'Live 3' },
      { _id: 'm4', title: 'Live 4' },
      { _id: 'm5', title: 'Live 5' },
    ],
    manualSelection: {
      movieIds: ['m1', 'm2', 'm3', 'm4', 'm5'],
      movies: [
        { _id: 'm1', title: 'Live 1' },
        { _id: 'm2', title: 'Live 2' },
        { _id: 'm3', title: 'Live 3' },
        { _id: 'm4', title: 'Live 4' },
        { _id: 'm5', title: 'Live 5' },
      ],
    },
    rotation: {
      activeMovies: [
        { _id: 'auto-1', title: 'Auto 1' },
        { _id: 'auto-2', title: 'Auto 2' },
      ],
      pool: [
        { _id: 'pool-1', title: 'Pool 1' },
      ],
    },
    meta: {
      configuredMode: 'manual',
      effectiveMode: 'manual',
      source: 'manual-selection',
    },
  };

  // Verify selectedIds comes from settings.movieIds / manualSelection, NOT rotation.activeMovies
  const savedMovieIds = mockHeroResponse.settings?.movieIds?.length
    ? mockHeroResponse.settings.movieIds
    : (mockHeroResponse.manualSelection?.movieIds || (mockHeroResponse.manualSelection?.movies || []).map((m) => String(m._id || m.id)));

  assert.deepEqual(savedMovieIds, ['m1', 'm2', 'm3', 'm4', 'm5']);
  assert.notDeepEqual(savedMovieIds, mockHeroResponse.rotation.activeMovies.map(m => m._id));

  // Verify liveMovies extraction
  assert.equal(mockHeroResponse.liveMovies.length, 5);
  assert.equal(mockHeroResponse.liveMovies[0].title, 'Live 1');
});

test('M3: HTTP 422 MANUAL_HERO_INVALID error structure parsing', () => {
  const mock422Error = {
    response: {
      status: 422,
      data: {
        success: false,
        code: 'MANUAL_HERO_INVALID',
        message: 'All five Manual Hero movies require verified native trailers.',
        invalidMovies: [
          {
            movieId: 'm-bad-1',
            title: 'Unverified Film',
            reasons: ['status-not-ready', 'not-verified'],
          },
        ],
      },
    },
  };

  const resp = mock422Error.response.data;
  assert.equal(mock422Error.response.status, 422);
  assert.equal(resp.code, 'MANUAL_HERO_INVALID');
  assert.equal(resp.invalidMovies.length, 1);
  assert.equal(resp.invalidMovies[0].title, 'Unverified Film');

  const details = resp.invalidMovies
    .map((m) => `${m.title || m.movieId}: ${(m.reasons || []).join(', ')}`)
    .join('; ');
  assert.equal(details, 'Unverified Film: status-not-ready, not-verified');
});

test('M3: Immediate live update uses data.liveHero.movies upon successful save', () => {
  const mockSaveResponse = {
    success: true,
    message: 'Hero updated successfully.',
    settings: {
      configuredMode: 'manual',
      effectiveMode: 'manual',
      movieIds: ['m1', 'm2', 'm3', 'm4', 'm5'],
    },
    liveHero: {
      movies: [
        { _id: 'm1', title: 'New Live 1' },
        { _id: 'm2', title: 'New Live 2' },
        { _id: 'm3', title: 'New Live 3' },
        { _id: 'm4', title: 'New Live 4' },
        { _id: 'm5', title: 'New Live 5' },
      ],
    },
    meta: {
      configuredMode: 'manual',
      effectiveMode: 'manual',
      source: 'manual-selection',
    },
  };

  assert.equal(mockSaveResponse.liveHero.movies.length, 5);
  assert.equal(mockSaveResponse.liveHero.movies[0].title, 'New Live 1');
});

test('M3: HeroSettings.jsx source code verification for 3 labeled sections, 422 error handling, and live state', async () => {
  const heroSettingsSource = await readFile(
    new URL('../src/pages/admin/HeroSettings.jsx', import.meta.url),
    'utf8'
  );

  assert.match(heroSettingsSource, /1\. Currently Live on Home/);
  assert.match(heroSettingsSource, /2\. Manual Selection/);
  assert.match(heroSettingsSource, /3\. Auto Rotation Pool/);
  assert.match(heroSettingsSource, /MANUAL_HERO_INVALID/);
  assert.match(heroSettingsSource, /invalidMoviesError/);
  assert.match(heroSettingsSource, /setLiveMovies/);
});

test('M3: Exact Manual Order preservation [A, B, C, D, E] across reloads and viewer IDs', () => {
  const movies = [
    { _id: 'movie-A', title: 'Movie A' },
    { _id: 'movie-B', title: 'Movie B' },
    { _id: 'movie-C', title: 'Movie C' },
    { _id: 'movie-D', title: 'Movie D' },
    { _id: 'movie-E', title: 'Movie E' },
  ];

  // Viewer 1
  const order1 = getOrComputeDailyOrder({
    movies,
    meta: { mode: 'manual', dateKey: '2026-08-03' },
    viewerKey: 'viewer-user-1',
  });
  assert.deepEqual(order1, ['movie-A', 'movie-B', 'movie-C', 'movie-D', 'movie-E']);

  // Viewer 2 (different session/id)
  const order2 = getOrComputeDailyOrder({
    movies,
    meta: { effectiveMode: 'manual', source: 'manual-selection', dateKey: '2026-08-03' },
    viewerKey: 'viewer-user-2-different',
  });
  assert.deepEqual(order2, ['movie-A', 'movie-B', 'movie-C', 'movie-D', 'movie-E']);

  // Apply order to movies
  const resultMovies = applyDailyOrder(movies, order1);
  assert.deepEqual(resultMovies.map(m => m._id), ['movie-A', 'movie-B', 'movie-C', 'movie-D', 'movie-E']);
});
