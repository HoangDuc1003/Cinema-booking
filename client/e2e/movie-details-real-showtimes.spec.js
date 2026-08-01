import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const MOVIE_ID = '1368337';
const SHOW_ID = '66b000000000000000000001';
const SHOW_DATE = '2026-07-27';
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0xkAAAAASUVORK5CYII=',
  'base64',
);

const movie = {
  id: Number(MOVIE_ID),
  _id: MOVIE_ID,
  title: 'Persisted Feature',
  overview: 'A movie details fixture backed by a persisted show.',
  poster_path: '/persisted-poster.jpg',
  backdrop_path: '/persisted-backdrop.jpg',
  release_date: '2026-07-01',
  vote_average: 8.1,
  runtime: 120,
  genres: [{ id: 18, name: 'Drama' }],
};

const similarMovies = Array.from({ length: 4 }, (_, index) => ({
  id: 2000 + index,
  _id: String(2000 + index),
  title: `Related feature ${index + 1}`,
  poster_path: `/related-${index + 1}.jpg`,
  backdrop_path: `/related-backdrop-${index + 1}.jpg`,
  release_date: '2026-08-01',
  vote_average: 7.5,
  hasShowtimes: index === 0,
}));

const fulfillImages = (page) => page.route(/.*\.(?:png|jpg|jpeg)$/, (route) => route.fulfill({
  status: 200,
  contentType: 'image/png',
  body: ONE_PIXEL_PNG,
}));

const installMovieDetailsRoutes = async (page, { dateTime, similarStatus = 200, simulated = false } = {}) => {
  await fulfillImages(page);
  await page.route(`**/api/show/tmdb/movie/${MOVIE_ID}/similar**`, (route) => route.fulfill({
    status: similarStatus,
    contentType: 'application/json',
    body: JSON.stringify(similarStatus === 200
      ? { success: true, data: { results: similarMovies } }
      : { success: false, message: 'Similar source unavailable.' }),
  }));
  await page.route(`**/api/show/tmdb/movie/${MOVIE_ID}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: movie }),
  }));
  await page.route(`**/api/show/${MOVIE_ID}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, movie, dateTime, simulated }),
  }));
};

test('Movie Details selects a persisted show date and renders visible similar cards', async ({ page }) => {
  const requestedSeatMaps = [];
  await page.addInitScript(() => {
    Object.defineProperty(window, 'IntersectionObserver', {
      value: undefined,
      configurable: true,
    });
  });
  await installMovieDetailsRoutes(page, {
    dateTime: {
      [SHOW_DATE]: [{
        showId: SHOW_ID,
        time: '2026-07-27T03:00:00.000Z',
        price: 75,
        hall: 'Hall A',
        isVirtual: false,
      }],
    },
  });
  await page.route('**/api/booking/seat/**', (route) => {
    requestedSeatMaps.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, occupiedSeats: ['A1'] }),
    });
  });

  await page.goto(`/movies/${MOVIE_ID}`);

  await expect(page.getByRole('heading', { name: 'Persisted Feature' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Mon, Jul 27|Mon Jul 27/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Book Now' })).toBeEnabled();
  await expect(page.locator('.catalog-grid-item')).toHaveCount(4);
  for (const item of await page.locator('.catalog-grid-item').all()) {
    await expect(item).toBeVisible();
    await expect(item).toHaveCSS('opacity', '1');
  }
  await expect(page.getByText('Related feature 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Persisted Feature', { exact: true })).toHaveCount(1);
  await expect(page.getByText(/Demo Showtimes|Demo Mode/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Book Now' }).click();
  await expect(page).toHaveURL(new RegExp(`/movies/${MOVIE_ID}/${SHOW_DATE}$`));
  await expect(page.getByRole('heading', { name: 'Select Your Seat' })).toBeVisible();
  await page.getByRole('button', { name: /Hall A/ }).click();
  await page.getByRole('button', { name: /10:00.*\$75/ }).click();
  await expect.poll(() => requestedSeatMaps).toEqual([
    expect.stringMatching(new RegExp(`/api/booking/seat/${SHOW_ID}$`)),
  ]);
});

test('Movie Details exposes empty and error states without generating showtimes', async ({ page }) => {
  await installMovieDetailsRoutes(page, { dateTime: {}, similarStatus: 503 });

  await page.goto(`/movies/${MOVIE_ID}`);

  await expect(page.getByText('No showtimes available for this movie.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Book Now' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Similar movies are unavailable' })).toBeVisible();
  await expect(page.locator('.movie-card')).toHaveCount(0);
  await expect(page.getByText(/Demo Showtimes|Demo Mode/)).toHaveCount(0);
});

test('demo showtimes show an English simulation label while keeping booking navigation enabled', async ({ page }) => {
  const dateTime = Object.fromEntries(Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${SHOW_DATE}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const dateKey = date.toISOString().slice(0, 10);
    return [dateKey, [{
      showId: `66b0000000000000000000${String(index + 2).padStart(2, '0')}`,
      time: `${dateKey}T03:00:00.000Z`,
      price: 75,
      hall: 'Hall A',
      isVirtual: false,
    }]];
  }));
  await installMovieDetailsRoutes(page, { dateTime, simulated: true });

  await page.goto(`/movies/${MOVIE_ID}`);

  await expect(page.getByRole('status', { name: 'Demo schedule' })).toBeVisible();
  await expect(page.locator('#dateSelect button[aria-pressed]')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Book Now' })).toBeEnabled();
  await page.getByRole('button', { name: 'Book Now' }).click();
  await expect(page).toHaveURL(new RegExp(`/movies/${MOVIE_ID}/${SHOW_DATE}$`));
});
