import { expect, test } from '@playwright/test';
import { env } from 'node:process';

test.skip(env.VITE_ENABLE_MOCK_DATA !== 'true', 'Run with VITE_ENABLE_MOCK_DATA=true.');

test('development explicit mock mode is still available', async ({ page }) => {
  await page.route('**/api/show/hero**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      movies: [{
        id: '9200',
        title: 'Development Hero',
        poster_path: '/hero.jpg',
        backdrop_path: '/hero.jpg',
      }],
    }),
  }));
  await page.route('**/api/show/tmdb/home-now-showing**', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, message: 'Unavailable' }),
  }));

  await page.goto('/');
  await page.locator('#home-now-showing-title').scrollIntoViewIfNeeded();
  const section = page.locator('.home-now-showing');
  await expect(section.getByRole('link', { name: 'View details for In the Lost Lands', exact: true })).toBeVisible({ timeout: 4_000 });
  await expect(section).toHaveAttribute('data-catalog-source', 'development-mock');
});
