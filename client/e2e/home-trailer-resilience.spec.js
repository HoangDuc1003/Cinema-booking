import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const POSTER = 'http://127.0.0.1:4174/e2e-home-poster.png';
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0xkAAAAASUVORK5CYII=',
  'base64',
);

const heroMovies = Array.from({ length: 5 }, (_, index) => ({
  id: String(7300 + index),
  _id: String(7300 + index),
  title: `Home Trailer Movie ${index + 1}`,
  release_date: '2026-08-01',
  poster_path: POSTER,
  backdrop_path: POSTER,
  runtime: 110,
  vote_average: 8.1,
  heroVideoStatus: 'missing',
}));

const nowMovies = [
  {
    ...heroMovies[0],
    id: '8401',
    _id: '8401',
    title: 'Now Showing Trailer Candidate',
  },
];

const mockHome = async (page, { heroAvailable = true, nowAvailable = true } = {}) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.route('**/api/show/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/home-now-showing')) {
      if (!nowAvailable) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, code: 'NOW_SHOWING_UNAVAILABLE' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { results: nowMovies } }),
      });
      return;
    }

    if (/\/api\/show\/hero(?:\?|$)/.test(url)) {
      if (!heroAvailable) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, code: 'HERO_UNAVAILABLE' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          batchId: 'e2e-home-batch',
          version: 1,
          settings: { mode: 'auto' },
          movies: heroMovies,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, shows: nowMovies }),
    });
  });

  await page.route(POSTER, (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: ONE_PIXEL_PNG,
  }));

  return requests;
};

const openTrailerSection = async (page) => {
  await page.goto('/');
  await page.locator('.home-now-showing').scrollIntoViewIfNeeded();
  await page.locator('#trailers').scrollIntoViewIfNeeded();
  await expect(page.locator('#home-trailer-section')).toBeVisible();
};

test('Hero and Now Showing success keep both sections visible', async ({ page }) => {
  await mockHome(page);
  await openTrailerSection(page);

  await expect(page.getByRole('heading', { name: 'Now Showing' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trailers' })).toBeVisible();
  await expect(page.locator('#home-trailer-section').getByText('Now Showing Trailer Candidate').first()).toBeVisible();
});

test('Now Showing 503 leaves the Hero-backed Trailer section visible and bounded to one request', async ({ page }) => {
  const requests = await mockHome(page, { nowAvailable: false });
  await openTrailerSection(page);

  await expect(page.getByRole('alert')).toContainText('Current releases are temporarily unavailable.');
  await expect(page.getByRole('heading', { name: 'Trailers' })).toBeVisible();
  await expect(page.getByText('Native video trailer preview unavailable. Showing poster fallback.')).toBeVisible();
  expect(requests.filter((url) => url.includes('/home-now-showing?limit=10'))).toHaveLength(1);
});

test('Hero failure with Now Showing success still supplies trailer candidates', async ({ page }) => {
  await mockHome(page, { heroAvailable: false });
  await openTrailerSection(page);

  await expect(page.getByRole('heading', { name: 'Trailers' })).toBeVisible();
  await expect(page.locator('#home-trailer-section').getByText('Now Showing Trailer Candidate').first()).toBeVisible();
});

test('Both sources failing render an explicit Trailer unavailable state', async ({ page }) => {
  await mockHome(page, { heroAvailable: false, nowAvailable: false });
  await openTrailerSection(page);

  await expect(page.getByRole('heading', { name: 'Trailers' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Trailer previews are temporarily unavailable.');
});
