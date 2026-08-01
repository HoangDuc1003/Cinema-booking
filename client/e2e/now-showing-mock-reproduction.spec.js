import { expect, test } from '@playwright/test';

const serverMovies = Array.from({ length: 10 }, (_, index) => ({
  _id: String(9100 + index),
  id: String(9100 + index),
  title: `Server Movie ${index + 1}`,
  overview: 'A server-backed movie used to reproduce the slow catalog response.',
  poster_path: `https://image.example.test/server-${index}.jpg`,
  backdrop_path: `https://image.example.test/server-${index}.jpg`,
  release_date: '2026-07-01',
  vote_average: 8,
  runtime: 120,
}));

const installHeroRoute = async (page) => {
  await page.route('**/api/show/hero**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, movies: serverMovies.slice(0, 5) }),
  }));
};

test('a six-second home catalog response renders server movies without dummyShowsData', async ({ page }) => {
  test.setTimeout(15_000);

  await installHeroRoute(page);

  await page.route('**/api/show/tmdb/home-now-showing**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { results: serverMovies } }),
    });
  });

  await page.route('**/api/show/tmdb/trailers**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [] }),
  }));

  await page.goto('/');
  await page.locator('#home-now-showing-title').scrollIntoViewIfNeeded();
  const section = page.locator('.home-now-showing');
  await expect(section.getByRole('link', { name: 'View details for Server Movie 1', exact: true })).toBeVisible({ timeout: 9_000 });
  await expect(section.getByRole('link', { name: 'View details for In the Lost Lands', exact: true })).toHaveCount(0);
});

test('production 503 with no server cache shows retryable error instead of mock movies', async ({ page }) => {
  let attempts = 0;
  await installHeroRoute(page);
  await page.route('**/api/show/tmdb/home-now-showing**', (route) => {
    attempts += 1;
    if (attempts < 3) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Unavailable' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { results: serverMovies } }),
    });
  });

  await page.goto('/');
  await page.locator('#home-now-showing-title').scrollIntoViewIfNeeded();
  const section = page.locator('.home-now-showing');
  await expect(section.getByRole('alert')).toBeVisible({ timeout: 4_000 });
  await expect(section.getByRole('link', { name: 'View details for In the Lost Lands', exact: true })).toHaveCount(0);

  await section.getByRole('button', { name: 'Retry' }).click();
  await expect(section.getByRole('link', { name: 'View details for Server Movie 1', exact: true })).toBeVisible();
  expect(attempts).toBe(3);
});

test('production 503 with a last-known-good cache renders stale server data only', async ({ page }) => {
  await page.addInitScript((cachedMovies) => {
    localStorage.setItem('nitrocine:home-now-showing-cache-v1', JSON.stringify({
      schemaVersion: 1,
      source: 'server',
      savedAt: new Date().toISOString(),
      meta: { version: 7, slot: 3 },
      movies: cachedMovies,
    }));
  }, [serverMovies[0]]);
  await installHeroRoute(page);
  await page.route('**/api/show/tmdb/home-now-showing**', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, message: 'Unavailable' }),
  }));

  await page.goto('/');
  await page.locator('#home-now-showing-title').scrollIntoViewIfNeeded();
  const section = page.locator('.home-now-showing');
  await expect(section).toHaveAttribute('data-catalog-state', 'stale', { timeout: 4_000 });
  await expect(section.getByRole('link', { name: 'View details for Server Movie 1', exact: true })).toBeVisible();
  await expect(section.getByRole('link', { name: 'View details for In the Lost Lands', exact: true })).toHaveCount(0);
});

test('production success with empty results is unavailable and never becomes mock data', async ({ page }) => {
  await installHeroRoute(page);
  await page.route('**/api/show/tmdb/home-now-showing**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { results: [] } }),
  }));

  await page.goto('/');
  await page.locator('#home-now-showing-title').scrollIntoViewIfNeeded();
  const section = page.locator('.home-now-showing');
  await expect(section.getByRole('alert')).toBeVisible({ timeout: 4_000 });
  await expect(section.getByRole('link', { name: 'View details for In the Lost Lands', exact: true })).toHaveCount(0);
});

test('production invalid JSON is an error state and never becomes mock data', async ({ page }) => {
  await installHeroRoute(page);
  await page.route('**/api/show/tmdb/home-now-showing**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: 'not-json',
  }));

  await page.goto('/');
  await page.locator('#home-now-showing-title').scrollIntoViewIfNeeded();
  const section = page.locator('.home-now-showing');
  await expect(section.getByRole('alert')).toBeVisible({ timeout: 4_000 });
  await expect(section.getByRole('link', { name: 'View details for In the Lost Lands', exact: true })).toHaveCount(0);
});

test('unmount aborts a pending home catalog request without updating the old component', async ({ page }) => {
  test.setTimeout(10_000);
  let requestStarted;
  const started = new Promise((resolve) => { requestStarted = resolve; });
  let requestFailed = false;

  page.on('requestfailed', (request) => {
    if (request.url().includes('/api/show/tmdb/home-now-showing')) requestFailed = true;
  });
  await installHeroRoute(page);
  await page.route('**/api/show/tmdb/home-now-showing**', async (route) => {
    requestStarted();
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { results: serverMovies } }),
      });
    } catch {
      // The component should have aborted this request during unmount.
    }
  });
  await page.route('**/api/show/tmdb/popular**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { results: serverMovies } }),
  }));

  await page.goto('/');
  await page.locator('#home-now-showing-title').scrollIntoViewIfNeeded();
  await started;
  await page.goto('/movies');
  await expect.poll(() => requestFailed, { timeout: 3_000 }).toBe(true);
  await expect(page.locator('.movie-card')).toHaveCount(10);
});
