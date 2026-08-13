import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const POSTER = 'http://127.0.0.1:4174/e2e-home-poster.png';
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0xkAAAAASUVORK5CYII=',
  'base64',
);

const makeMovie = (id, title) => ({
  id: String(id),
  _id: String(id),
  title,
  release_date: '2026-08-01',
  poster_path: POSTER,
  backdrop_path: POSTER,
  runtime: 110,
  vote_average: 8.1,
  popularity: 100,
  heroVideoStatus: 'missing',
});

const heroMovies = Array.from({ length: 5 }, (_, index) => (
  makeMovie(7300 + index, `Hero Trailer Movie ${index + 1}`)
));
const nowMovies = Array.from({ length: 10 }, (_, index) => (
  makeMovie(8400 + index, `Now Showing Trailer ${index + 1}`)
));

const trailerFor = (movieId, { available = true, status } = {}) => {
  const key = `trailer${String(movieId).slice(-4).padStart(4, '0')}`;
  return {
    movieId: String(movieId),
    available,
    status: status || (available ? 'available' : 'unavailable'),
    provider: available ? 'youtube' : null,
    key: available ? key : null,
    type: available ? 'Trailer' : null,
    official: available,
    name: available ? 'Official Trailer' : null,
    thumbnailUrl: available ? `https://i.ytimg.com/vi/${key}/hqdefault.jpg` : null,
  };
};

const mockHome = async (page, {
  heroAvailable = true,
  nowAvailable = true,
  trailerAvailable = true,
  trailerResults,
} = {}) => {
  const requests = [];
  const trailerBodies = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.route('https://i.ytimg.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: ONE_PIXEL_PNG,
  }));
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body></body></html>',
  }));
  await page.route(POSTER, (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: ONE_PIXEL_PNG,
  }));
  await page.route('**/api/show/**', async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.includes('/home-now-showing')) {
      await route.fulfill({
        status: nowAvailable ? 200 : 503,
        contentType: 'application/json',
        body: JSON.stringify(nowAvailable
          ? { success: true, data: { results: nowMovies, meta: { source: 'tmdb-now-playing', region: 'VN' } } }
          : { success: false, code: 'TMDB_UNAVAILABLE' }),
      });
      return;
    }
    if (/\/api\/show\/hero(?:\?|$)/.test(url)) {
      await route.fulfill({
        status: heroAvailable ? 200 : 503,
        contentType: 'application/json',
        body: JSON.stringify(heroAvailable
          ? { success: true, batchId: 'e2e-home-batch', version: 1, settings: { mode: 'manual' }, movies: heroMovies }
          : { success: false, code: 'HERO_UNAVAILABLE' }),
      });
      return;
    }
    if (url.includes('/tmdb/trailers') && request.method() === 'POST') {
      const body = request.postDataJSON();
      trailerBodies.push(body);
      if (!trailerAvailable) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, code: 'TRAILERS_UNAVAILABLE' }),
        });
        return;
      }
      const results = trailerResults
        ? trailerResults(body.movieIds)
        : body.movieIds.map((movieId) => trailerFor(movieId));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            results,
            meta: {
              requested: body.movieIds.length,
              available: results.filter((entry) => entry.available).length,
            },
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { results: [] }, shows: [] }),
    });
  });

  return { requests, trailerBodies };
};

const openTrailerSection = async (page) => {
  await page.goto('/');
  await page.locator('#trailers').scrollIntoViewIfNeeded();
  const section = page.locator('#home-trailer-section');
  await expect(section).toBeVisible();
  return section;
};

test('Home renders ten TMDB discovery cards and one privacy-aware YouTube player from one batch', async ({ page }) => {
  const evidence = await mockHome(page);
  const section = await openTrailerSection(page);

  await expect(page.getByRole('heading', { name: 'Now Showing' })).toBeVisible();
  await expect(page.locator('.home-now-showing .movie-card')).toHaveCount(10);
  await expect(section.getByRole('heading', { name: 'Trailers', exact: true })).toBeVisible();
  await expect(section.locator('iframe')).toHaveCount(1);
  await expect(section.locator('iframe')).toHaveAttribute('src', /https:\/\/www\.youtube-nocookie\.com\/embed\/trailer8400/);
  await expect(section.locator('video')).toHaveCount(0);
  await expect(section.getByRole('button', { name: /trailer for Now Showing Trailer/ })).toHaveCount(10);

  expect(evidence.trailerBodies).toEqual([{ movieIds: nowMovies.map((movie) => movie.id) }]);
  expect(evidence.requests.filter((url) => /\/tmdb\/movie\/[^/]+\/videos/.test(url))).toEqual([]);
  expect(evidence.requests.filter((url) => /\/api\/show\/hero(?:\?|$)/.test(url))).toHaveLength(1);
  expect(evidence.requests.filter((url) => url.includes('/home-now-showing?limit=10'))).toHaveLength(1);

  const [sectionBox, footerBox] = await Promise.all([
    section.boundingBox(),
    page.locator('footer').boundingBox(),
  ]);
  expect(footerBox.y).toBeGreaterThan(sectionBox.y);
});

test('selecting a trailer card replaces the sole iframe without navigation', async ({ page }) => {
  await mockHome(page);
  const section = await openTrailerSection(page);
  const startingUrl = page.url();

  await section.getByRole('button', { name: 'Play trailer for Now Showing Trailer 2' }).click();

  await expect(section.locator('iframe')).toHaveCount(1);
  await expect(section.locator('iframe')).toHaveAttribute('src', /trailer8401/);
  expect(page.url()).toBe(startingUrl);
  await expect(section.getByRole('button', { name: 'Play trailer for Now Showing Trailer 2' })).toHaveAttribute('aria-pressed', 'true');
});

test('one unavailable trailer does not hide the remaining YouTube trailers', async ({ page }) => {
  await mockHome(page, {
    trailerResults: (movieIds) => movieIds.map((movieId, index) => trailerFor(movieId, { available: index !== 0 })),
  });
  const section = await openTrailerSection(page);

  await expect(section.getByText('Trailer unavailable for this movie')).toBeVisible();
  await expect(section.locator('iframe')).toHaveCount(0);

  await section.getByRole('button', { name: 'Play trailer for Now Showing Trailer 2' }).click();
  await expect(section.locator('iframe')).toHaveCount(1);
  await expect(section.locator('iframe')).toHaveAttribute('src', /trailer8401/);
});

test('all missing trailers keep an explicit section state and Footer below it', async ({ page }) => {
  await mockHome(page, {
    trailerResults: (movieIds) => movieIds.map((movieId) => trailerFor(movieId, { available: false })),
  });
  const section = await openTrailerSection(page);

  await expect(section.getByRole('heading', { name: 'Trailers', exact: true })).toBeVisible();
  await expect(section.getByText('Trailers are currently unavailable')).toBeVisible();
  await expect(section.locator('iframe, video')).toHaveCount(0);
  await expect(page.locator('footer')).toBeVisible();
});

test('trailer endpoint failure leaves Hero and Now Showing healthy', async ({ page }) => {
  const evidence = await mockHome(page, { trailerAvailable: false });
  const section = await openTrailerSection(page);

  await expect(page.locator('.hero-section')).toHaveAttribute('data-catalog-source', 'server');
  await expect(page.locator('.home-now-showing .movie-card')).toHaveCount(10);
  await expect(section.getByText('Trailers are currently unavailable')).toBeVisible();
  await expect(section.getByText('Trailer lookup is temporarily unavailable.')).toBeVisible();
  await expect(section.locator('iframe, video')).toHaveCount(0);
  expect(evidence.trailerBodies).toEqual([{ movieIds: nowMovies.map((movie) => movie.id) }]);
});

test('Hero failure cannot hide Now Showing or its trailer batch', async ({ page }) => {
  const evidence = await mockHome(page, { heroAvailable: false });
  const section = await openTrailerSection(page);

  await expect(page.locator('.home-now-showing .movie-card')).toHaveCount(10);
  await expect(section.locator('iframe')).toHaveCount(1);
  expect(evidence.trailerBodies).toHaveLength(1);
  expect(evidence.trailerBodies[0].movieIds).toEqual(nowMovies.map((movie) => movie.id));
});

test('Now Showing failure leaves Hero healthy and uses Hero only as trailer fallback candidates', async ({ page }) => {
  const evidence = await mockHome(page, { nowAvailable: false });
  const section = await openTrailerSection(page);

  await expect(page.locator('.hero-section')).toHaveAttribute('data-catalog-source', 'server');
  await expect(page.getByRole('alert')).toContainText('Current releases are temporarily unavailable.');
  await expect(section.locator('iframe')).toHaveCount(1);
  expect(evidence.trailerBodies).toEqual([{ movieIds: heroMovies.map((movie) => movie.id) }]);
  expect(evidence.requests.filter((url) => url.includes('/home-now-showing?limit=10'))).toHaveLength(1);
});
