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

test('phone menu opens over a locked page, takes focus, and closes on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockHomeApis(page);
  await page.goto('/');
  await expect(page.locator('.hero-title')).toContainText('Nitro Night');

  const menuButton = page.getByRole('button', { name: 'Open menu' });
  await menuButton.click();
  const nav = page.locator('#app-mobile-nav');
  await expect(nav).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close menu' })).toBeFocused();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  // Every link is a full-size touch target.
  for (const link of await nav.getByRole('link').all()) {
    expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }

  // Tab cycles inside the open menu instead of reaching controls behind it.
  await page.keyboard.press('Shift+Tab');
  await expect(nav.getByRole('link', { name: 'Favorites' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close menu' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await expect(menuButton).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');

  // Leaving by a link also hands focus back instead of dropping it on <body>.
  await menuButton.click();
  await nav.getByRole('link', { name: 'Movies' }).click();
  await expect(page).toHaveURL(/\/movies$/);
  await expect(nav).toBeHidden();
  await expect(menuButton).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('Now Showing rail snaps on phones and its indicator follows the scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockHomeApis(page);
  await page.goto('/');
  await page.locator('#home-now-showing-title').scrollIntoViewIfNeeded();

  const rail = page.locator('[data-rail="now-showing"]');
  await expect(rail.getByRole('link').first()).toBeVisible();
  await expect(rail).toHaveCSS('scroll-snap-type', 'x mandatory');
  const bar = rail.locator('xpath=following-sibling::div[1]//div/div');
  const progress = () => bar.evaluate((el) => Number(el.style.transform.match(/scaleX\(([\d.]+)\)/)?.[1]));
  expect(await progress()).toBeLessThan(0.5);
  await rail.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await expect.poll(progress).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('movie details puts the booking button on the first phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockHomeApis(page);
  const movie = movies[0];
  await page.route(`**/api/show/tmdb/movie/${movie.id}/similar**`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { results: movies.slice(1, 5) } }),
  }));
  await page.route(`**/api/show/tmdb/movie/${movie.id}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: movie }),
  }));
  await page.route(`**/api/show/${movie.id}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, movie, dateTime: {} }),
  }));
  await page.goto(`/movies/${movie.id}`);

  await expect(page.getByRole('heading', { name: 'Nitro Night', level: 1 })).toBeVisible();
  const buy = page.getByRole('link', { name: 'Buy Tickets' });
  const box = await buy.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('phone seat picking ends in a sticky checkout bar without a toast per seat', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockHomeApis(page);
  const movie = movies[0];
  const showDate = '2026-07-27';
  await page.route(`**/api/show/${movie.id}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      movie,
      dateTime: {
        [showDate]: [
          { showId: 'show-1', time: `${showDate}T03:00:00.000Z`, price: 5, hall: 'Hall A', isVirtual: false },
          { showId: 'show-2', time: `${showDate}T08:00:00.000Z`, price: 6, hall: 'Hall A', isVirtual: false },
        ],
      },
    }),
  }));
  await page.route('**/api/booking/seat/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, occupiedSeats: ['D9'] }),
  }));

  await page.goto(`/movies/${movie.id}/${showDate}`);
  await page.getByRole('button', { name: /Hall A/ }).click();
  await page.getByRole('button', { name: /\d{1,2}:\d{2} [AP]M \$5$/ }).click();

  // The seat map loads even when Clerk never does (the token wait is bounded).
  const d5 = page.locator('[data-seat="D5"]');
  await expect(d5).toHaveAttribute('aria-label', 'Seat D5, $7.50', { timeout: 10_000 });
  await expect(page.locator('[data-seat="D9"]')).toBeDisabled();
  await expect(page.locator('[data-seat="D9"]')).toHaveAttribute('aria-label', 'Seat D9, taken');

  await d5.click();
  await page.locator('[data-seat="D6"]').click();
  await expect(d5).toHaveAttribute('aria-pressed', 'true');

  const bar = page.locator('.seat-checkout-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('D5, D6');
  await expect(bar).toContainText('$15');
  const checkout = bar.getByRole('button', { name: /Checkout/ });
  // Measure where the bar settles, not a frame of its slide-up.
  await bar.evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  const box = await checkout.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByText(/Seat D5 selected|Seat D6 selected/)).toHaveCount(0);

  await page.locator('[data-seat="D6"]').click();
  await expect(bar).toContainText('$7.50');
  await expect(bar).not.toContainText('D6');

  // Another showtime starts from an empty pick at its own price.
  await page.getByRole('button', { name: /\d{1,2}:\d{2} [AP]M \$6$/ }).click();
  await expect(bar).toBeHidden();
  await expect(page.getByText('Seats cleared for the new showtime')).toBeVisible();
  await expect(d5).toHaveAttribute('aria-label', 'Seat D5, $9', { timeout: 10_000 });
  await expect(d5).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
