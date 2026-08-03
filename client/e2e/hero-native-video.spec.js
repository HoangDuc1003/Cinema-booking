import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0xkAAAAASUVORK5CYII=',
  'base64',
);
const POSTER = 'http://127.0.0.1:4174/e2e-hero-poster.png';
const NEXT_REFRESH_AT = new Date(Date.now() + (48 * 60 * 60 * 1000)).toISOString();

const heroMovies = Array.from({ length: 5 }, (_, index) => ({
  id: String(9100 + index),
  _id: String(9100 + index),
  title: `Native Hero ${index + 1}`,
  overview: `Movie-specific native trailer fixture ${index + 1}.`,
  release_date: '2026-07-29',
  vote_average: 8.2 - (index * 0.1),
  vote_count: 1200 - index,
  runtime: 108 + index,
  adult: false,
  poster_path: POSTER,
  backdrop_path: POSTER,
  heroVideoStatus: 'ready',
  heroVideoUrl: `http://127.0.0.1:4174/e2e-media/movie-${9100 + index}.mp4`,
  heroVideoMimeType: 'video/mp4',
  heroVideoVersion: 3,
  heroVideoPoster: POSTER,
}));

const mockHome = async (page, {
  soundDefaultEnabled = false,
  defaultVolume = 0.35,
  movies = heroMovies,
  movieVideos = {},
} = {}) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.route('**/api/show/**', async (route) => {
    const url = route.request().url();
    let body;
    if (/\/api\/show\/hero(?:\?|$)/.test(url)) {
      body = {
        success: true,
        batchId: 'e2e-native-batch',
        version: 3,
        generatedAt: '2026-07-29T00:00:00.000Z',
        nextRefreshAt: NEXT_REFRESH_AT,
        timezone: 'Asia/Ho_Chi_Minh',
        settings: {
          mode: 'manual',
          heroSoundDefaultEnabled: soundDefaultEnabled,
          heroDefaultVolume: defaultVolume,
        },
        movies,
      };
    } else if (url.includes('/tmdb/trailers')) {
      body = { success: true, data: [] };
    } else if (url.includes('/tmdb/movie/') && url.includes('/videos')) {
      const movieId = url.match(/\/tmdb\/movie\/([^/]+)\/videos/)?.[1] || '';
      body = { success: true, data: { results: movieVideos[movieId] || [] } };
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

  await page.route(POSTER, (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: ONE_PIXEL_PNG,
  }));

  return requests;
};

test('a poster-only Hero keeps its trailer action and opens the lower trailer section', async ({ page }) => {
  await page.addInitScript(() => {
    window.__E2E_TRAILER_MODE = 'section';
  });
  const posterOnlyMovies = heroMovies.map(({ heroVideoStatus, heroVideoUrl, heroVideoMimeType, heroVideoVersion, heroVideoPoster, ...movie }) => movie);
  await mockHome(page, {
    movies: posterOnlyMovies,
    movieVideos: {
      9100: [{
        site: 'YouTube',
        key: 'dQw4w9WgXcQ',
        type: 'Trailer',
        name: 'Official Trailer',
      }],
    },
  });
  await page.goto('/?heroMock=0');

  const hero = page.locator('.hero-section');
  await expect(hero.locator('video')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Trailer for Native Hero 1|Trailer/i })).toBeVisible();
  await expect(hero).not.toContainText('Trailer for this movie is currently unavailable');

  await page.getByRole('button', { name: /Trailer for Native Hero 1|Trailer/i }).click();
  await expect(page.locator('#home-trailer-section')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const target = document.getElementById('trailers');
    return target ? Math.abs(target.getBoundingClientRect().top) < 180 : false;
  })).toBe(true);
  await expect(page.locator('#home-trailer-section')).toContainText('Native video trailer preview unavailable');
  await expect(page.locator('#home-trailer-section')).toContainText('Native Hero 1');
});

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
  const first = await video.evaluate((element) => element.currentTime);
  await pageWait(video, 700);
  const second = await video.evaluate((element) => element.currentTime);
  expect(second).toBeGreaterThan(first + 0.15);
  return { first, second };
};

const pageWait = async (locator, milliseconds) => {
  await locator.page().waitForTimeout(milliseconds);
};

test('Hero mounts one native video, advances currentTime, and makes no YouTube request', async ({ page }) => {
  const requests = await mockHome(page);
  await page.goto('/?heroMock=1');

  const hero = page.locator('.hero-section');
  const video = hero.locator('video');
  await expect(hero).toHaveAttribute('data-catalog-source', 'server');
  await expect(video).toHaveCount(1);
  await expect(hero.locator('iframe')).toHaveCount(0);
  const samples = await waitForAdvancingPlayback(video);

  const contract = await video.evaluate((element) => ({
    controls: element.controls,
    controlsAttribute: element.hasAttribute('controls'),
    autoPlay: element.autoplay,
    playsInline: element.playsInline,
    preload: element.preload,
    disablePictureInPictureAttribute: element.hasAttribute('disablepictureinpicture'),
    disableRemotePlaybackAttribute: element.hasAttribute('disableremoteplayback'),
    controlsList: element.getAttribute('controlslist'),
    pointerEvents: getComputedStyle(element).pointerEvents,
    width: element.videoWidth,
    height: element.videoHeight,
  }));
  expect(contract).toMatchObject({
    controls: false,
    controlsAttribute: false,
    autoPlay: true,
    playsInline: true,
    preload: 'metadata',
    disablePictureInPictureAttribute: true,
    disableRemotePlaybackAttribute: true,
    controlsList: 'nodownload noplaybackrate noremoteplayback',
    pointerEvents: 'none',
  });
  expect(contract.width).toBeGreaterThan(0);
  expect(contract.height).toBeGreaterThan(0);
  expect(samples.second).toBeGreaterThan(samples.first);
  await expect(page.getByRole('button', { name: /pause/i })).toHaveCount(0);

  const heroApiRequests = requests.filter((url) => /\/api\/show\/hero(?:\?|$)/.test(url));
  const initialVideoRequests = requests.filter((url) => /\/mock\/hero-trailer\.mp4/.test(url));
  const nativeMediaRequests = requests.filter((url) => /\.(?:mp4|webm)(?:[?#]|$)/i.test(url));
  const forbiddenRequests = requests.filter((url) => (
    /^https?:\/\/(?:[^/]+\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be|googlevideo\.com)\//i.test(url)
    || /\/tmdb\/movie\/[^/]+\/videos/i.test(url)
    || /\/api\/tmdb\/movie\/[^/]+\/videos/i.test(url)
    || /\/api\/tmdb\/trailers/i.test(url)
  ));
  expect(heroApiRequests).toHaveLength(1);
  expect(new Set(initialVideoRequests).size).toBeLessThanOrEqual(1);
  expect(new Set(nativeMediaRequests).size).toBeLessThanOrEqual(1);
  const uniqueInitialVideoRequests = new Set(initialVideoRequests);
  expect(uniqueInitialVideoRequests.size).toBeLessThanOrEqual(1);
  expect([...uniqueInitialVideoRequests].every(
    (url) => url === 'http://127.0.0.1:4174/mock/hero-trailer.mp4',
  )).toBe(true);
  expect(forbiddenRequests).toEqual([]);
});

test('hovering the sound control reveals an accessible volume slider', async ({ page }) => {
  await mockHome(page);
  await page.goto('/?heroMock=1');

  const hero = page.locator('.hero-section');
  const video = hero.locator('video');
  await waitForAdvancingPlayback(video);

  const soundControl = page.locator('button[data-hero-sound-control]');
  const volumePopover = page.locator('.hero-volume-popover');
  const volumeSlider = page.getByRole('slider', { name: 'Trailer volume' });
  await expect(soundControl).toBeVisible();
  await soundControl.hover();
  await expect(volumePopover).toHaveCSS('opacity', '1');
  await expect(volumeSlider).toHaveAttribute('aria-valuetext', /percent/);

  await volumeSlider.fill('0.7');
  await expect.poll(() => video.evaluate((element) => element.volume)).toBeGreaterThan(0.65);
  await expect.poll(() => video.evaluate((element) => element.muted)).toBe(false);
  await expect.poll(
    () => page.evaluate(() => localStorage.getItem('nitrocine:hero-volume')),
  ).toBe('0.7');
});

test('ended and failed native trailers hand off in server order with only one active video', async ({ page }) => {
  await mockHome(page);
  await page.goto('/?heroMock=1');

  const hero = page.locator('.hero-section');
  await expect(hero.locator('.hero-title')).toContainText('Native Hero 1');
  await waitForAdvancingPlayback(hero.locator('video'));

  await hero.locator('video').evaluate((element) => {
    element.dispatchEvent(new Event('ended'));
  });
  await expect(hero.locator('.hero-title')).toContainText('Native Hero 2', { timeout: 6_000 });
  await expect(hero.locator('video')).toHaveCount(1);
  await expect(hero.locator('video source')).toHaveAttribute('src', '/mock/hero-trailer.mp4');
  await waitForAdvancingPlayback(hero.locator('video'));

  await hero.locator('video').evaluate((element) => {
    element.dispatchEvent(new Event('error'));
  });
  await expect(hero.locator('.hero-title')).toContainText('Native Hero 3', { timeout: 6_000 });
  await expect(hero.locator('video')).toHaveCount(1);
  await expect(hero.locator('iframe')).toHaveCount(0);
  await waitForAdvancingPlayback(hero.locator('video'));
});

test('blocked audible autoplay falls back muted and stores consent only after a gesture succeeds', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('nitrocine:hero-audio-consent');
    localStorage.removeItem('nitrocine:hero-volume');
    const nativePlay = HTMLMediaElement.prototype.play;
    let audibleBlockConsumed = false;
    HTMLMediaElement.prototype.play = function patchedPlay() {
      if (!this.muted && !audibleBlockConsumed) {
        audibleBlockConsumed = true;
        return Promise.reject(new DOMException('Audible autoplay blocked for E2E', 'NotAllowedError'));
      }
      return nativePlay.call(this);
    };
  });
  await mockHome(page, { soundDefaultEnabled: true, defaultVolume: 0.65 });
  await page.goto('/?heroMock=1');

  const hero = page.locator('.hero-section');
  const video = hero.locator('video');
  await waitForAdvancingPlayback(video);
  await expect.poll(() => video.evaluate((element) => element.muted)).toBe(true);
  await expect(page.getByRole('button', { name: 'Turn trailer sound on' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('nitrocine:hero-audio-consent'))).not.toBe('enabled');

  await page.getByRole('button', { name: 'Turn trailer sound on' }).click();
  await expect.poll(() => video.evaluate((element) => element.muted)).toBe(false);
  await expect(page.getByRole('button', { name: 'Mute trailer' })).toBeVisible();
  await expect.poll(
    () => page.evaluate(() => localStorage.getItem('nitrocine:hero-audio-consent')),
  ).toBe('enabled');
  await expect.poll(() => video.evaluate((element) => element.volume)).toBeGreaterThan(0.6);

  await video.evaluate((element) => element.dispatchEvent(new Event('ended')));
  await expect(hero.locator('.hero-title')).toContainText('Native Hero 2', { timeout: 6_000 });
  const nextVideo = hero.locator('video');
  await waitForAdvancingPlayback(nextVideo);
  await expect.poll(() => nextVideo.evaluate((element) => element.muted)).toBe(false);
  await expect.poll(() => nextVideo.evaluate((element) => element.volume)).toBeGreaterThan(0.6);
});

test('one touch gesture makes exactly one audible recovery attempt', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome', 'The regression needs one touch-capable browser run.');

  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4174',
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  try {
    await page.addInitScript(() => {
      localStorage.removeItem('nitrocine:hero-audio-consent');
      localStorage.removeItem('nitrocine:hero-volume');
      const nativePlay = HTMLMediaElement.prototype.play;
      let audibleBlockConsumed = false;
      window.__heroAudiblePlayCalls = 0;
      HTMLMediaElement.prototype.play = function patchedPlay() {
        if (!this.muted) {
          window.__heroAudiblePlayCalls += 1;
          if (!audibleBlockConsumed) {
            audibleBlockConsumed = true;
            return Promise.reject(new DOMException('Audible autoplay blocked for E2E', 'NotAllowedError'));
          }
        }
        return nativePlay.call(this);
      };
    });
    await mockHome(page, { soundDefaultEnabled: true, defaultVolume: 0.65 });
    await page.goto('/?heroMock=1');

    const hero = page.locator('.hero-section');
    const video = hero.locator('video');
    await waitForAdvancingPlayback(video);
    await expect(page.getByRole('button', { name: 'Turn trailer sound on' })).toBeVisible();
    const callsBeforeTouch = await page.evaluate(() => window.__heroAudiblePlayCalls);

    await hero.locator('.hero-title').tap();

    await expect.poll(() => video.evaluate((element) => element.muted)).toBe(false);
    await expect.poll(
      () => page.evaluate(() => localStorage.getItem('nitrocine:hero-audio-consent')),
    ).toBe('enabled');
    await page.waitForTimeout(100);
    const callsAfterTouch = await page.evaluate(() => window.__heroAudiblePlayCalls);
    expect(callsAfterTouch - callsBeforeTouch).toBe(1);
  } finally {
    await context.close();
  }
});

test('reduced motion stays on the poster until the user explicitly starts the trailer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requests = await mockHome(page);
  await page.goto('/?heroMock=1');

  const hero = page.locator('.hero-section');
  await expect(hero.locator('video')).toHaveCount(0);
  expect(requests.filter((url) => /\/mock\/hero-trailer\.mp4/.test(url))).toEqual([]);

  await page.getByRole('button', { name: /Trailer/i }).click();
  await expect(hero.locator('video')).toHaveCount(1);
  await waitForAdvancingPlayback(hero.locator('video'));
});

test('repeated unexpected pauses fail over instead of freezing the current trailer', async ({ page }) => {
  await page.addInitScript(() => {
    const nativePlay = HTMLMediaElement.prototype.play;
    let forcedPauseCount = 0;
    HTMLMediaElement.prototype.play = function patchedPlay() {
      const result = nativePlay.call(this);
      if (this.closest?.('.hero-section') && forcedPauseCount < 3) {
        forcedPauseCount += 1;
        Promise.resolve(result).then(() => {
          window.setTimeout(() => this.pause(), 50);
        });
      }
      return result;
    };
  });
  await mockHome(page);
  await page.goto('/?heroMock=1');

  const hero = page.locator('.hero-section');
  await expect(hero.locator('.hero-title')).toContainText('Native Hero 2', { timeout: 9_000 });
  await expect(hero.locator('video')).toHaveCount(1);
  await waitForAdvancingPlayback(hero.locator('video'));
});

test('an ended trailer skips a following movie whose native source is rejected', async ({ page }) => {
  const directlyServedFixture = 'http://127.0.0.1:4174/%6Dock/hero-trailer.mp4';
  const orderedMovies = heroMovies.map((movie, index) => ({
    ...movie,
    heroVideoUrl: directlyServedFixture,
    heroVideoStatus: index === 1 ? 'missing' : 'ready',
  }));
  await mockHome(page, { movies: orderedMovies });
  await page.goto('/?heroMock=1');

  const hero = page.locator('.hero-section');
  await waitForAdvancingPlayback(hero.locator('video'));
  await page.evaluate(() => window.history.replaceState({}, '', '/'));
  await hero.locator('video').evaluate((element) => {
    element.dispatchEvent(new Event('ended'));
  });

  await expect(hero.locator('.hero-title')).toContainText('Native Hero 2', { timeout: 6_000 });
  await expect(hero.locator('.hero-title')).toContainText('Native Hero 3', { timeout: 14_000 });
  await expect(hero.locator('video')).toHaveCount(1);
  await waitForAdvancingPlayback(hero.locator('video'));
});
