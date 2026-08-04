import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0xkAAAAASUVORK5CYII=',
  'base64',
);
const poster = 'http://127.0.0.1:4174/mobile-hero-poster.png';
const movies = Array.from({ length: 10 }, (_, index) => ({
  _id: String(1000 + index),
  id: String(1000 + index),
  title: index === 0 ? 'Nitro Night' : `Movie ${index + 1}`,
  overview: 'A cinematic journey made for the big screen and unforgettable moments.',
  poster_path: poster,
  backdrop_path: poster,
  release_date: '2026-07-16',
  vote_average: 8.2,
  runtime: 112,
}));

const mockHomeApis = async (page) => {
  await page.route(poster, (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: ONE_PIXEL_PNG,
  }));
  await page.route('**/api/show/**', async (route) => {
    const url = route.request().url();
    let body;
    if (url.includes('/api/show/hero')) {
      body = { success: true, settings: { mode: 'manual' }, movies: movies.slice(0, 5) };
    } else if (url.includes('/home-now-showing')) {
      body = { success: true, data: { results: movies } };
    } else if (url.includes('/trailers')) {
      body = { success: true, data: [] };
    } else if (url.endsWith('/api/show/all')) {
      body = { success: true, shows: [] };
    } else {
      body = { success: true, data: { results: movies } };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
};

for (const viewport of [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 740, height: 360 },
]) {
  test(`unified Home remains usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockHomeApis(page);
    await page.goto('/');

    await expect(page.locator('.app-navbar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    await expect(page.locator('.hero-section')).toBeVisible();
    await expect(page.locator('.hero-title')).toContainText('Nitro Night');
    await expect(page.locator('.hero-section iframe')).toHaveCount(0);
    await expect(page.getByTestId('mobile-auth-entry')).toHaveCount(0);
    await expect(page.getByTestId('profile-picker')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('mobile reduced-motion mode keeps Hero on an accessible poster', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockHomeApis(page);
  await page.goto('/');

  const hero = page.locator('.hero-section');
  await expect(hero.locator('.hero-poster-shell')).toBeVisible();
  await expect(hero.locator('video, iframe')).toHaveCount(0);
  await expect(hero.getByRole('button', { name: 'Book Now' })).toBeVisible();
});

test('desktop Home keeps Navbar, Hero, and Footer in the unified tree', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockHomeApis(page);
  await page.goto('/');

  await expect(page.locator('.app-navbar')).toBeVisible();
  await expect(page.locator('.hero-section')).toBeVisible();
  await expect(page.locator('footer')).toBeAttached();
  await expect(page.getByTestId('mobile-bottom-nav')).toHaveCount(0);
});
