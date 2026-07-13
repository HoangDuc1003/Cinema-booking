import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0xkAAAAASUVORK5CYII=',
  'base64',
);

const VIEWPORTS = [
  { name: 'small phone portrait', width: 320, height: 568 },
  { name: 'phone portrait', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'tablet portrait', width: 768, height: 1024 },
  { name: 'short tablet landscape', width: 1024, height: 600 },
  { name: 'wide short tablet', width: 1194, height: 500 },
  { name: 'large tablet landscape', width: 1366, height: 1024 },
  { name: 'desktop', width: 1920, height: 1080 },
];

const heroMovies = Array.from({ length: 5 }, (_, index) => ({
  id: 9000 + index,
  _id: String(9000 + index),
  title: index === 0 ? 'Responsive Hero' : `Hero Movie ${index + 1}`,
  overview: 'A deterministic Hero fixture used to verify full-screen responsive layout.',
  backdrop_path: `/hero-${index + 1}.jpg`,
  poster_path: `/poster-${index + 1}.jpg`,
  release_date: '2026-07-01',
  runtime: 112,
  vote_average: 8.2,
  genres: [{ id: 1, name: 'Drama' }, { id: 2, name: 'Adventure' }],
}));

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/show\/all(?:\?|$)/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, shows: [] }),
  }));
  await page.route(/\/api\/show\/hero(?:\?|$)/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, settings: {}, movies: heroMovies }),
  }));
  await page.route(/\/api\/show\/tmdb\/home-now-showing(?:\?|$)/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { results: heroMovies } }),
  }));
  await page.route('https://image.tmdb.org/**', (route) => route.abort('failed'));
  await page.route(/\/api\/show\/tmdb\/image(?:\?|$)/, (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: ONE_PIXEL_PNG,
  }));
});

for (const viewport of VIEWPORTS) {
  test(`${viewport.name} ${viewport.width}x${viewport.height} keeps Hero full-screen and usable`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expect(page.locator('.hero-section')).toBeVisible();
    await expect(page.locator('.hero-title')).toContainText('Responsive Hero', { timeout: 10_000 });
    await expect(page.locator('.hero-poster.is-ready')).toBeVisible({ timeout: 10_000 });

    const layout = await page.evaluate(() => {
      const rect = (element) => {
        const value = element.getBoundingClientRect();
        return {
          top: value.top,
          right: value.right,
          bottom: value.bottom,
          left: value.left,
          width: value.width,
          height: value.height,
        };
      };
      const hero = document.querySelector('.hero-section');
      const media = document.querySelector('.hero-media');
      const navbar = document.querySelector('.app-navbar');
      const title = document.querySelector('.hero-title');
      const actions = document.querySelector('.hero-actions');
      const nextSection = hero.nextElementSibling;
      const heroImages = [...hero.querySelectorAll('img')];

      return {
        viewport: { width: innerWidth, height: innerHeight },
        hero: rect(hero),
        media: rect(media),
        navbar: rect(navbar),
        title: rect(title),
        actions: rect(actions),
        nextTop: rect(nextSection).top,
        documentWidth: document.documentElement.scrollWidth,
        brokenImages: heroImages.filter((image) => image.complete && image.naturalWidth === 0).length,
        posterReady: document.querySelector('.hero-poster')?.classList.contains('is-ready') || false,
        posterSource: document.querySelector('.hero-poster')?.currentSrc || '',
      };
    });

    expect(Math.abs(layout.hero.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.hero.height - layout.viewport.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.media.top - layout.hero.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.media.height - layout.hero.height)).toBeLessThanOrEqual(1);
    expect(layout.nextTop).toBeGreaterThanOrEqual(layout.viewport.height - 1);
    expect(layout.title.top).toBeGreaterThanOrEqual(layout.navbar.bottom - 1);
    expect(layout.actions.bottom).toBeLessThanOrEqual(layout.hero.bottom + 1);
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport.width);
    expect(layout.brokenImages).toBe(0);
    expect(layout.posterReady).toBe(true);
    expect(layout.posterSource).toContain('/api/show/tmdb/image?');
  });
}

test('Hero keeps a branded fallback when both TMDB and the proxy are unavailable', async ({ page }) => {
  await page.route(/\/api\/show\/tmdb\/image(?:\?|$)/, (route) => route.abort('failed'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.locator('.hero-poster-shell.is-fallback')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.hero-title')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Book Now' })).toBeVisible();

  const brokenImages = await page.locator('.hero-section img').evaluateAll((images) => (
    images.filter((image) => image.complete && image.naturalWidth === 0).length
  ));
  expect(brokenImages).toBe(0);
});
