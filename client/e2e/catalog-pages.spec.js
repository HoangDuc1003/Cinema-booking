import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0xkAAAAASUVORK5CYII=',
  'base64',
);

const serverMovies = Array.from({ length: 6 }, (_, index) => ({
  id: 9100 + index,
  _id: String(9100 + index),
  title: `Server catalog ${index + 1}`,
  poster_path: `/catalog-${index + 1}.jpg`,
  backdrop_path: `/catalog-backdrop-${index + 1}.jpg`,
  release_date: '2026-08-01',
  vote_average: 7.8,
  runtime: 108,
}));

const catalogCases = [
  { path: '/movies', endpoint: '/popular' },
  { path: '/theater', endpoint: '/now-playing' },
  { path: '/releases', endpoint: '/upcoming' },
];

const fulfillImages = (page) => page.route(/.*\.(?:png|jpg|jpeg)$/, (route) => route.fulfill({
  status: 200,
  contentType: 'image/png',
  body: ONE_PIXEL_PNG,
}));

for (const catalogCase of catalogCases) {
  test(`${catalogCase.path} uses skeleton, error and retry without mock cards`, async ({ page }) => {
    let attempts = 0;
    let releaseFirstRequest;
    const firstRequestGate = new Promise((resolve) => {
      releaseFirstRequest = resolve;
    });
    await fulfillImages(page);
    await page.route(`**/api/show/tmdb${catalogCase.endpoint}**`, async (route) => {
      attempts += 1;
      if (attempts === 1) {
        await firstRequestGate;
        await route.fulfill({ status: 503, body: 'Unavailable' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { results: serverMovies } }),
      });
    });

    await page.goto(catalogCase.path);
    await expect(page.locator('.catalog-card-skeleton').first()).toBeVisible();
    await expect(page.getByText('In the Lost Lands', { exact: true })).toHaveCount(0);
    releaseFirstRequest();
    await expect(page.getByRole('heading', { name: 'Chưa thể tải danh sách phim' })).toBeVisible();
    await expect(page.getByText('In the Lost Lands', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.locator('.movie-card')).toHaveCount(6);
    await expect(page.getByText('Server catalog 1', { exact: true })).toBeVisible();
    await expect(page.getByText('In the Lost Lands', { exact: true })).toHaveCount(0);
  });
}

test('Favorites initializes from real localStorage with no loading flash', async ({ page }) => {
  await fulfillImages(page);
  await page.addInitScript((movies) => {
    localStorage.setItem('nitro_favorites', JSON.stringify(movies));
  }, serverMovies.slice(0, 2));
  await page.goto('/favorite');

  await expect(page.locator('.catalog-card-skeleton')).toHaveCount(0);
  await expect(page.locator('.movie-card')).toHaveCount(2);
  await expect(page.getByText('Server catalog 1', { exact: true })).toBeVisible();
});

test('Favorites renders a shared empty state when localStorage is empty', async ({ page }) => {
  await page.goto('/favorite');
  await expect(page.locator('.catalog-card-skeleton')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Bộ sưu tập đang chờ bạn' })).toBeVisible();
});
