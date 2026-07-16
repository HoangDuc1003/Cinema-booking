import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0xkAAAAASUVORK5CYII=',
  'base64',
);

const candidates = Array.from({ length: 5 }, (_, index) => ({
  id: String(7000 + index),
  _id: String(7000 + index),
  title: `Catalog trailer ${index}`,
  overview: '',
  release_date: '2026-01-01',
  vote_average: 8,
  poster_path: `/poster-${index}.jpg`,
  backdrop_path: `/backdrop-${index}.jpg`,
}));

test('Home renders immediately without list calls and Trailer resolves at most active plus next', async ({ page }) => {
  let liveListRequests = 0;
  let videoLookups = 0;

  await page.route(/.*\.(?:png|jpg|jpeg)$/, (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: ONE_PIXEL_PNG,
  }));
  await page.route(/\/api\/show\/tmdb\/image(?:\?|$)/, (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: ONE_PIXEL_PNG,
  }));
  await page.route('**/api/show/hero', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, movies: [candidates[0]] }),
  }));
  await page.route('**/api/show/tmdb/home-now-showing**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { results: candidates } }),
  }));
  await page.route('**/api/show/tmdb/trailers**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: candidates }),
  }));
  await page.route('**/api/show/all', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, shows: [] }),
  }));
  await page.route(/\/api\/show\/tmdb\/(?:popular|upcoming|now-playing)(?:\?|$)/, (route) => {
    liveListRequests += 1;
    return route.abort();
  });
  await page.route('**/api/show/tmdb/movie/*/videos', (route) => {
    videoLookups += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { results: [{ site: 'YouTube', type: 'Trailer', official: true, key: 'abcdefghijk', name: 'Trailer' }] },
      }),
    });
  });
  await page.route('https://www.youtube.com/**', (route) => route.abort());

  await page.goto('/');
  await expect(page.locator('.hero-section')).toBeVisible();
  await expect(page.getByTestId('home-entry-loader')).toHaveCount(0);
  await expect.poll(() => videoLookups, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1_500);

  expect(liveListRequests).toBe(0);
  expect(videoLookups).toBeLessThanOrEqual(2);
});
