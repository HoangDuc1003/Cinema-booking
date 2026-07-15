import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const HERO_NATIVE_MOVIE = {
  id: 424245,
  _id: '424245',
  title: 'Native Video Hero',
  heroVideoUrl: '/mock/hero-trailer.mp4',
  heroVideoMimeType: 'video/mp4',
  heroVideoStatus: 'ready',
  backdrop_path: '/direct-play-backdrop.jpg',
  poster_path: '/direct-play-poster.jpg',
};

const HERO_POSTER_ONLY_MOVIE = {
  id: 424242,
  _id: '424242',
  title: 'Poster Only Hero',
  backdrop_path: '/direct-play-backdrop.jpg',
  poster_path: '/direct-play-poster.jpg',
};

const HERO_MOVIES = [HERO_NATIVE_MOVIE, HERO_POSTER_ONLY_MOVIE];

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0xkAAAAASUVORK5CYII=',
  'base64',
);

async function setupHeroTest(page, movies) {
  let requestsToYouTubeIframeApi = 0;
  let requestsToTmdbVideos = 0;

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: false },
      configurable: true,
    });
  });

  await page.route('https://www.youtube.com/iframe_api', (route) => {
    requestsToYouTubeIframeApi++;
    return route.abort();
  });

  await page.route('**/api/show/tmdb/movie/*/videos', (route) => {
    requestsToTmdbVideos++;
    return route.abort();
  });

  await page.route('**/api/show/hero', (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, movies }),
    });
  });

  await page.route(/.*\.(png|jpg|jpeg)$/, (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: ONE_PIXEL_PNG,
    });
  });

  await page.route(/\/api\/show\/tmdb\/image(?:\?|$)/, (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: ONE_PIXEL_PNG,
    });
  });

  // Do not intercept or mock hero-trailer.mp4, allow it to pass through to be served natively
  await page.route('**/mock/hero-trailer*.mp4', (route) => {
    return route.continue();
  });

  return {
    getYouTubeRequests: () => requestsToYouTubeIframeApi,
    getTmdbRequests: () => requestsToTmdbVideos,
  };
}

test.describe('Hero Component Invariants', () => {
  test('Native desktop movie - plays muted native video, no YouTube, no TMDB', async ({ page }) => {
    const tracker = await setupHeroTest(page, [HERO_NATIVE_MOVIE]);
    await page.goto('/');

    const hero = page.locator('.hero-section');
    
    // Invariants
    await expect(hero.locator('iframe')).toHaveCount(0);
    await expect(hero.locator('.hero-youtube-video')).toHaveCount(0);
    await expect(hero.locator('video')).toHaveCount(1);
    
    expect(tracker.getYouTubeRequests()).toBe(0);
    expect(tracker.getTmdbRequests()).toBe(0);

    const video = hero.locator('video').first();
    
    // Prove playback
    await expect.poll(() => video.evaluate((element) => element.readyState)).toBeGreaterThanOrEqual(2);
    
    // Prove muted
    expect(await video.evaluate((element) => element.muted)).toBe(true);

    const timeA = await video.evaluate((element) => element.currentTime);
    await page.waitForTimeout(500);
    const timeB = await video.evaluate((element) => element.currentTime);

    expect(timeB).toBeGreaterThan(timeA);
  });

  test('Poster-only movie - no video element, no YouTube, no TMDB', async ({ page }) => {
    const tracker = await setupHeroTest(page, [HERO_POSTER_ONLY_MOVIE]);
    await page.goto('/');

    const hero = page.locator('.hero-section');
    
    await expect(hero.locator('iframe')).toHaveCount(0);
    await expect(hero.locator('video')).toHaveCount(0);
    
    expect(tracker.getYouTubeRequests()).toBe(0);
    expect(tracker.getTmdbRequests()).toBe(0);
  });

  test.describe('Mobile / reduced-motion / save-data', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // Mobile viewport
    
    test('Mobile - no video request before direct user interaction', async ({ page }) => {
      const tracker = await setupHeroTest(page, [HERO_NATIVE_MOVIE]);
      await page.goto('/');

      const hero = page.locator('.hero-section');
      
      await expect(hero.locator('video')).toHaveCount(0);
      await expect(hero.locator('iframe')).toHaveCount(0);
      
      expect(tracker.getYouTubeRequests()).toBe(0);
      expect(tracker.getTmdbRequests()).toBe(0);
    });
  });

  test('Server order is preserved client-side', async ({ page }) => {
    await setupHeroTest(page, [HERO_POSTER_ONLY_MOVIE, HERO_NATIVE_MOVIE]);
    await page.goto('/');

    const hero = page.locator('.hero-section');
    const title = hero.locator('.hero-title, h1').first();
    await expect(title).toHaveText('Poster Only Hero', { timeout: 10000 });
  });

  test('Automatic playback remains muted even when sound preference is set to on', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('sound_preference', 'on');
    });

    const tracker = await setupHeroTest(page, [HERO_NATIVE_MOVIE]);
    await page.goto('/');

    const hero = page.locator('.hero-section');
    const video = hero.locator('video').first();

    // Wait for the video to play
    await expect.poll(() => video.evaluate((element) => element.readyState)).toBeGreaterThanOrEqual(2);
    const timeA = await video.evaluate((element) => element.currentTime);
    await page.waitForTimeout(500);
    const timeB = await video.evaluate((element) => element.currentTime);
    expect(timeB).toBeGreaterThan(timeA);

    // Invariant: it must remain muted
    const isMuted = await video.evaluate((element) => element.muted);
    expect(isMuted).toBe(true);
  });

  test('Inactive movie metadata or video is NOT prefetched', async ({ page }) => {
    const movies = [
      {
        id: 424240,
        _id: '424240',
        title: 'Active Native Movie',
        heroVideoUrl: '/mock/hero-trailer.mp4',
        heroVideoMimeType: 'video/mp4',
        heroVideoStatus: 'ready',
        backdrop_path: '/backdrop-0.jpg',
        poster_path: '/poster-0.jpg',
      },
      {
        id: 424241,
        _id: '424241',
        title: 'Inactive Native Movie 1',
        heroVideoUrl: '/mock/hero-trailer-1.mp4',
        heroVideoMimeType: 'video/mp4',
        heroVideoStatus: 'ready',
        backdrop_path: '/backdrop-1.jpg',
        poster_path: '/poster-1.jpg',
      },
      {
        id: 424242,
        _id: '424242',
        title: 'Inactive Poster Movie 2',
        backdrop_path: '/backdrop-2.jpg',
        poster_path: '/poster-2.jpg',
      },
      {
        id: 424243,
        _id: '424243',
        title: 'Inactive Native Movie 3',
        heroVideoUrl: '/mock/hero-trailer-3.mp4',
        heroVideoMimeType: 'video/mp4',
        heroVideoStatus: 'ready',
        backdrop_path: '/backdrop-3.jpg',
        poster_path: '/poster-3.jpg',
      },
      {
        id: 424244,
        _id: '424244',
        title: 'Inactive Poster Movie 4',
        backdrop_path: '/backdrop-4.jpg',
        poster_path: '/poster-4.jpg',
      },
    ];

    let inactiveVideoRequests = 0;
    let inactiveTmdbRequests = 0;

    await setupHeroTest(page, movies);

    await page.route('**/mock/hero-trailer-*.mp4', (route) => {
      inactiveVideoRequests++;
      const tinyMp4 = Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAydtZGF0AAACrgYF//+/v7+/', 'base64');
      return route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        body: tinyMp4,
      });
    });

    await page.route('**/api/show/tmdb/movie/*/videos', (route) => {
      const url = route.request().url();
      if (!url.includes('424240')) {
        inactiveTmdbRequests++;
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { results: [] } }),
      });
    });

    await page.goto('/');

    const hero = page.locator('.hero-section');
    const video = hero.locator('video').first();

    await expect.poll(() => video.evaluate((element) => element.readyState)).toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(1000);

    expect(inactiveVideoRequests).toBe(0);
    expect(inactiveTmdbRequests).toBe(0);
  });

  test('Migrated - Entry loader', async ({ page }) => {
    // Configure timings so that the loader stays visible for 1.5 seconds, then exits
    await page.addInitScript(() => {
      window.__NITROCINE_HOME_TIMINGS__ = {
        loaderMs: 1500,
        fadeMs: 200,
        posterWarmupMs: 0, // reveal immediately
      };
    });

    const tracker = await setupHeroTest(page, [HERO_NATIVE_MOVIE]);
    await page.goto('/');

    const loader = page.getByTestId('home-entry-loader');
    const hero = page.locator('.hero-section');
    const video = hero.locator('video').first();
    const videoShell = hero.locator('.hero-video-shell').first();

    // Verify loader displays initially
    await expect(loader).toBeVisible();
    await expect(loader.locator('.home-boot-loader__spinner')).toHaveCount(1);
    await expect(loader.locator('.home-boot-loader__message')).toHaveText('Loading');

    // Verify native video exists and is muted
    await expect(video).toHaveCount(1);
    expect(await video.evaluate((el) => el.muted)).toBe(true);

    // Verify native video starts loading/playing behind the loader
    await expect.poll(() => video.evaluate((el) => el.readyState)).toBeGreaterThanOrEqual(2);
    const timeA = await video.evaluate((el) => el.currentTime);
    await page.waitForTimeout(200);
    const timeB = await video.evaluate((el) => el.currentTime);
    expect(timeB).toBeGreaterThan(timeA);

    // Verify loader exits
    await expect(loader).toHaveCount(0);

    // Once loader finishes, verify video is revealed immediately (is-visible and data-video-safe="true")
    await expect(videoShell).toHaveClass(/is-visible/);
    await expect(videoShell).toHaveAttribute('data-video-safe', 'true');
  });

  test('Migrated - Poster safety (Buffering / Pause remask)', async ({ page }) => {
    await page.addInitScript(() => {
      window.__NITROCINE_HOME_TIMINGS__ = {
        loaderMs: 0,
        fadeMs: 0,
        posterWarmupMs: 0,
      };
    });

    const tracker = await setupHeroTest(page, [HERO_NATIVE_MOVIE]);
    await page.goto('/');

    const hero = page.locator('.hero-section');
    const poster = hero.locator('.hero-poster-shell');
    const videoShell = hero.locator('.hero-video-shell');
    const video = hero.locator('video').first();

    // Wait for video to be playing stably
    await expect(videoShell).toHaveClass(/is-visible/);
    await expect(videoShell).toHaveAttribute('data-video-safe', 'true');
    await expect(poster).toHaveClass(/is-hidden/);

    // 1. Trigger 'pause' media event
    await video.evaluate((el) => {
      el.dispatchEvent(new Event('pause'));
    });
    // Verify poster is raised immediately
    await expect(poster).toHaveClass(/is-visible/);
    await expect(videoShell).toHaveAttribute('data-video-safe', 'false');

    // Recover playback: play it again
    await video.evaluate((el) => {
      el.play();
    });
    // Verify poster hides again
    await expect(poster).toHaveClass(/is-hidden/);
    await expect(videoShell).toHaveAttribute('data-video-safe', 'true');

    // 2. Trigger 'waiting' media event
    await video.evaluate((el) => {
      el.dispatchEvent(new Event('waiting'));
    });
    // Verify poster is raised immediately
    await expect(poster).toHaveClass(/is-visible/);
    await expect(videoShell).toHaveAttribute('data-video-safe', 'false');

    // Recover playback: play it again
    await video.evaluate((el) => {
      el.play();
    });
    // Verify poster hides again
    await expect(poster).toHaveClass(/is-hidden/);
    await expect(videoShell).toHaveAttribute('data-video-safe', 'true');

    // 3. Trigger 'stalled' media event
    await video.evaluate((el) => {
      el.dispatchEvent(new Event('stalled'));
    });
    // Verify poster is raised immediately
    await expect(poster).toHaveClass(/is-visible/);
    await expect(videoShell).toHaveAttribute('data-video-safe', 'false');

    // Recover playback: play it again
    await video.evaluate((el) => {
      el.play();
    });
    // Verify poster hides again
    await expect(poster).toHaveClass(/is-hidden/);
    await expect(videoShell).toHaveAttribute('data-video-safe', 'true');

    // Verify that no second video element is created
    await expect(hero.locator('video')).toHaveCount(1);
  });

  test('Migrated - Movie switching', async ({ page }) => {
    await page.addInitScript(() => {
      window.__NITROCINE_HOME_TIMINGS__ = {
        loaderMs: 0,
        fadeMs: 0,
        posterWarmupMs: 0,
      };
    });

    const HERO_NATIVE_MOVIE_2 = {
      ...HERO_NATIVE_MOVIE,
      id: 424246,
      _id: '424246',
      title: 'Native Video Hero 2',
    };

    const tracker = await setupHeroTest(page, [HERO_NATIVE_MOVIE, HERO_NATIVE_MOVIE_2]);
    await page.goto('/');

    const hero = page.locator('.hero-section');
    const title = hero.locator('.hero-title').first();

    // Verify first movie is playing
    await expect(title).toContainText('Native Video Hero');
    const video1 = hero.locator('video').first();
    await expect.poll(() => video1.evaluate((el) => el.readyState)).toBeGreaterThanOrEqual(2);

    // Switch to second movie via thumbnail rail
    const thumbs = hero.locator('.hero-poster-thumb');
    await expect(thumbs).toHaveCount(2);
    await thumbs.nth(1).click();

    // Verify title switched
    await expect(title).toContainText('Native Video Hero 2');

    // Verify exactly one video element remains
    await expect(hero.locator('video')).toHaveCount(1);

    // Verify the new video is loaded and starts playing
    const video2 = hero.locator('video').first();
    await expect.poll(() => video2.evaluate((el) => el.readyState)).toBeGreaterThanOrEqual(2);
    const timeA = await video2.evaluate((el) => el.currentTime);
    await page.waitForTimeout(300);
    const timeB = await video2.evaluate((el) => el.currentTime);
    expect(timeB).toBeGreaterThan(timeA);
  });

  test('Migrated - Compact UI', async ({ page }) => {
    await page.addInitScript(() => {
      window.__NITROCINE_HOME_TIMINGS__ = {
        loaderMs: 0,
        fadeMs: 0,
        posterWarmupMs: 0,
      };
    });

    const tracker = await setupHeroTest(page, [HERO_NATIVE_MOVIE]);
    await page.goto('/');

    const hero = page.locator('.hero-section');
    const contentZone = hero.locator('.hero-content-zone');
    const title = contentZone.locator('.hero-title');
    const overview = contentZone.locator('.hero-overview');
    const rail = hero.locator('.hero-poster-rail');

    // Wait for the compact state to be triggered automatically after 3s stable playback
    await expect(contentZone).toHaveClass(/is-compact/, { timeout: 10000 });

    // Verify details are hidden
    await expect(overview).toHaveAttribute('aria-hidden', 'true');
    await expect(overview).toHaveCSS('max-height', '0px');

    // Verify thumbnail rail is hidden/non-interactive
    await expect(rail).toHaveClass(/is-hidden/);
    await expect(rail).toHaveCSS('opacity', '0');
    await expect(rail).toHaveCSS('pointer-events', 'none');

    // Verify title is visible
    await expect(title).toBeVisible();

    // Hover content zone to expand it
    await contentZone.hover();
    await expect(contentZone).toHaveClass(/is-expanded/);
    await expect(overview).toHaveAttribute('aria-hidden', 'false');

    // Verify rail returns
    await expect(rail).not.toHaveClass(/is-hidden/);
  });
});

