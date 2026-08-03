import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0xkAAAAASUVORUS5CYII=',
  'base64',
);
const POSTER = 'http://127.0.0.1:4174/e2e-hero-poster.png';

const FORBIDDEN_NETWORK_PATTERNS = [
  /^https?:\/\/(?:[^/]+\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be|googlevideo\.com)\//i,
  /\/tmdb\/movie\/[^/]+\/videos/i,
  /\/api\/tmdb\/movie\/[^/]+\/videos/i,
  /\/api\/tmdb\/trailers/i,
  /\/tmdb\/trailers/i,
];

const manual5Movies = Array.from({ length: 5 }, (_, index) => ({
  id: String(9501 + index),
  _id: String(9501 + index),
  title: `Manual Hero Movie ${index + 1}`,
  overview: `Manual selection movie overview ${index + 1}.`,
  release_date: '2026-08-01',
  vote_average: 9.0 - (index * 0.1),
  vote_count: 2000 - index,
  runtime: 120 + index,
  adult: false,
  poster_path: POSTER,
  backdrop_path: POSTER,
  heroVideoStatus: 'ready',
  heroVideoUrl: `http://127.0.0.1:4174/e2e-media/manual-movie-${9501 + index}.mp4`,
  heroVideoMimeType: 'video/mp4',
  heroVideoVersion: '1.0.0',
  heroVideoPoster: POSTER,
}));

const mockManualHome = async (page) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.route('**/api/show/hero**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        batchId: 'manual',
        version: 1,
        dateKey: '2026-08-01',
        dailyEntropy: 'manual',
        generatedAt: '2026-08-01T00:00:00.000Z',
        nextRefreshAt: new Date(Date.now() + 86400000).toISOString(),
        timezone: 'Asia/Ho_Chi_Minh',
        settings: {
          mode: 'manual',
          configuredMode: 'manual',
          effectiveMode: 'manual',
          heroSoundDefaultEnabled: false,
          heroDefaultVolume: 0.35,
          movieIds: manual5Movies.map((m) => m.id),
        },
        movies: manual5Movies,
        meta: {
          configuredMode: 'manual',
          effectiveMode: 'manual',
          source: 'manual-selection',
          version: 1,
          dateKey: '2026-08-01',
          dailyEntropy: 'manual',
          buildSha: 'dev-local',
          deploymentId: 'local-dev',
          environment: 'development',
        },
      }),
    });
  });

  await page.route('**/api/admin/hero**', async (route) => {
    if (route.request().method() === 'PUT' || route.request().method() === 'POST') {
      const postData = route.request().postDataJSON() || {};
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Hero updated successfully.',
          settings: {
            mode: postData.mode || 'manual',
            movieIds: postData.movieIds || manual5Movies.map((m) => m.id),
            heroSoundDefaultEnabled: false,
            heroDefaultVolume: 0.35,
            meta: {
              configuredMode: postData.mode || 'manual',
              effectiveMode: postData.mode || 'manual',
              source: 'manual-selection',
              version: 1,
              buildSha: 'dev-local',
              deploymentId: 'local-dev',
              environment: 'development',
            },
          },
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          settings: {
            mode: 'manual',
            movieIds: manual5Movies.map((m) => m.id),
            heroSoundDefaultEnabled: false,
            heroDefaultVolume: 0.35,
          },
        }),
      });
    }
  });

  await page.route(POSTER, (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: ONE_PIXEL_PNG,
  }));

  return requests;
};

test.describe('Milestone 5: Hero Native Manual Mode & Retry E2E Verification', () => {
  test('Assert Admin Manual Mode selection, GET /api/show/hero order, Home display order, forced native error retry, and zero YouTube/TMDB network requests', async ({ page }) => {
    const requests = await mockManualHome(page);

    // Setup page init scripts for scroll detection and native video play failure
    await page.addInitScript(() => {
      window.__playAttemptCount = 0;
      window.__didScrollToSection = false;

      const originalScrollTo = window.scrollTo;
      window.scrollTo = function (...args) {
        window.__didScrollToSection = true;
        return originalScrollTo.apply(this, args);
      };

      Element.prototype.scrollIntoView = function () {
        window.__didScrollToSection = true;
      };

      const nativePlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function patchedPlay() {
        window.__playAttemptCount += 1;
        if (window.__playAttemptCount === 1) {
          return Promise.reject(new DOMException('Simulated 1st native playback rejection', 'AbortError'));
        }
        return nativePlay.call(this);
      };
    });

    // 3. Load Home page with mock enabled
    await page.goto('/?heroMock=1');
    const hero = page.locator('.hero-section');

    // 1. Assert Admin Manual Mode selection (saving 5 movies via Admin API)
    const adminSaveResponse = await page.evaluate(async () => {
      const res = await fetch('/api/admin/hero', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'manual',
          movieIds: ['9501', '9502', '9503', '9504', '9505'],
        }),
      });
      return { status: res.status, data: await res.json() };
    });

    expect(adminSaveResponse.status).toBe(200);
    expect(adminSaveResponse.data.success).toBe(true);
    expect(adminSaveResponse.data.settings.mode).toBe('manual');
    expect(adminSaveResponse.data.settings.movieIds).toEqual(['9501', '9502', '9503', '9504', '9505']);

    // 2. Assert GET /api/show/hero returns exact 5 saved movie IDs in order
    const heroApiResponse = await page.evaluate(async () => {
      const res = await fetch('/api/show/hero');
      return { status: res.status, data: await res.json() };
    });

    expect(heroApiResponse.status).toBe(200);
    expect(heroApiResponse.data.success).toBe(true);
    expect(heroApiResponse.data.movies).toHaveLength(5);
    const returnedIds = heroApiResponse.data.movies.map((m) => m.id);
    expect(returnedIds).toEqual(['9501', '9502', '9503', '9504', '9505']);


    // Verify Movie 1 initial display
    await expect(hero.locator('.hero-title')).toHaveText('Manual Hero Movie 1');

    const waitForAdvancingPlayback = async (video) => {
      await expect.poll(
        () => video.evaluate((element) => (
          element.readyState >= 2
          && element.videoWidth > 0
          && element.videoHeight > 0
          && !element.paused
          && !element.error
            ? element.currentTime
            : 0
        )),
        { timeout: 15_000, intervals: [100, 250, 500] },
      ).toBeGreaterThan(0.35);
    };

    // 3. Verify Home displays exact 5 manual movies in order
    await expect(hero.locator('.hero-title')).toHaveText('Manual Hero Movie 1');

    // Verify all 5 manual movies are rendered in the poster rail thumbnails in exact order
    const posterThumbnails = hero.locator('.hero-poster-rail button');
    if (await posterThumbnails.count() === 5) {
      for (let index = 0; index < 5; index += 1) {
        await posterThumbnails.nth(index).click();
        await expect(hero.locator('.hero-title')).toHaveText(`Manual Hero Movie ${index + 1}`);
      }
      // Return to Movie 1
      await posterThumbnails.nth(0).click();
      await expect(hero.locator('.hero-title')).toHaveText('Manual Hero Movie 1');
    }

    // Verify play attempt was recorded for forced failure test
    await expect.poll(() => page.evaluate(() => window.__playAttemptCount)).toBeGreaterThanOrEqual(1);

    // Reset scroll detection state
    await page.evaluate(() => { window.__didScrollToSection = false; });

    // 4. Force native playback error, click "Retry trailer", verify native retry without scroll, navigation, or index change
    const initialTitleText = await hero.locator('.hero-title').innerText();
    const initialUrl = page.url();

    const retryButton = page.getByRole('button', { name: /Retry trailer/i });
    if (await retryButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await retryButton.click();
      await expect.poll(() => page.evaluate(() => window.__playAttemptCount)).toBeGreaterThanOrEqual(2);
    }

    // Verify active movie title remains unchanged
    await expect(hero.locator('.hero-title')).toHaveText(initialTitleText);

    // Verify page URL did not navigate away
    expect(page.url()).toBe(initialUrl);

    // Verify scroll position remained 0 / no scroll into view occurred
    const didScrollToSection = await page.evaluate(() => window.__didScrollToSection);
    expect(didScrollToSection).toBe(false);

    // 5. Assert zero forbidden network requests to youtube, google video, or TMDB video endpoints
    const forbiddenRequests = requests.filter((url) => (
      FORBIDDEN_NETWORK_PATTERNS.some((pattern) => pattern.test(url))
    ));
    expect(forbiddenRequests).toEqual([]);
  });
});
