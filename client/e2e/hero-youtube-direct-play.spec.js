import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0xkAAAAASUVORK5CYII=',
  'base64',
);

const VIDEO_ID = 'abcdefghijk';
const HERO_MOVIE = {
  id: 424242,
  _id: '424242',
  title: 'YouTube Direct Play Hero',
  overview: 'A deterministic fixture for the production metadata path.',
  backdrop_path: '/youtube-direct-play-backdrop.jpg',
  poster_path: '/youtube-direct-play-poster.jpg',
  release_date: '2026-07-01',
  runtime: 118,
  vote_average: 8.4,
  genres: [{ id: 1, name: 'Drama' }],
};

const FAKE_YOUTUBE_API = `
(() => {
  const PlayerState = Object.freeze({
    UNSTARTED: -1,
    ENDED: 0,
    PLAYING: 1,
    PAUSED: 2,
    BUFFERING: 3,
    CUED: 5,
  });
  const telemetry = {
    constructorCount: 0,
    loadVideoByIdCount: 0,
    playVideoCount: 0,
    muteCount: 0,
    iframeClickCount: 0,
    state: PlayerState.UNSTARTED,
    player: null,
  };

  class FakePlayer {
    constructor(element, config) {
      telemetry.constructorCount += 1;
      telemetry.player = this;
      this.config = config;
      this.state = PlayerState.UNSTARTED;
      this.videoId = '';
      this.baseTime = 0;
      this.playStartedAt = 0;
      this.iframe = document.createElement('iframe');
      this.iframe.addEventListener('click', () => {
        telemetry.iframeClickCount += 1;
      });
      element.replaceWith(this.iframe);
      setTimeout(() => config.events?.onReady?.({ target: this }), 0);
    }

    getCurrentTime() {
      if (this.state !== PlayerState.PLAYING) return this.baseTime;
      return this.baseTime + ((performance.now() - this.playStartedAt) / 1000);
    }

    emit(state) {
      this.baseTime = this.getCurrentTime();
      this.state = state;
      telemetry.state = state;
      if (state === PlayerState.PLAYING) this.playStartedAt = performance.now();
      this.config.events?.onStateChange?.({ data: state, target: this });
    }

    loadVideoById(request) {
      telemetry.loadVideoByIdCount += 1;
      this.videoId = typeof request === 'string' ? request : request.videoId;
      this.baseTime = Number(request?.startSeconds) || 0;
      this.emit(PlayerState.BUFFERING);
      setTimeout(() => {
        if (this.state === PlayerState.BUFFERING) this.playVideo();
      }, 50);
    }

    playVideo() {
      telemetry.playVideoCount += 1;
      this.emit(PlayerState.PLAYING);
    }

    pauseVideo() {
      this.emit(PlayerState.PAUSED);
    }

    mute() {
      telemetry.muteCount += 1;
    }

    unMute() {}
    setVolume() {}
    getPlayerState() { return this.state; }
    getVideoData() { return { video_id: this.videoId }; }
    getIframe() { return this.iframe; }
    getOptions() { return ['captions']; }
    setOption() {}
    destroy() { this.iframe.remove(); }
  }

  telemetry.currentTime = () => telemetry.player?.getCurrentTime() || 0;
  window.__FAKE_YOUTUBE__ = telemetry;
  window.YT = { Player: FakePlayer, PlayerState };
  queueMicrotask(() => window.onYouTubeIframeAPIReady?.());
})();
`;

const installBackend = async (page) => {
  const requests = { metadata: 0, iframeApi: 0 };

  await page.route('https://www.youtube.com/iframe_api', (route) => {
    requests.iframeApi += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: FAKE_YOUTUBE_API,
    });
  });
  await page.route('https://image.tmdb.org/**', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: ONE_PIXEL_PNG,
  }));
  await page.route(/\/api\/show\/tmdb\/image(?:\?|$)/, (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: ONE_PIXEL_PNG,
  }));
  await page.route(/\/api\/show\/hero(?:\?|$)/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, settings: {}, movies: [HERO_MOVIE] }),
  }));
  await page.route(/\/api\/show\/tmdb\/movie\/424242\/videos(?:\?|$)/, (route) => {
    requests.metadata += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: HERO_MOVIE.id,
          results: [{
            id: 'official-trailer',
            key: VIDEO_ID,
            name: 'Official Trailer',
            site: 'YouTube',
            type: 'Trailer',
          }],
        },
      }),
    });
  });
  await page.route(/\/api\/show\/tmdb\/home-now-showing(?:\?|$)/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { results: [HERO_MOVIE] } }),
  }));
  await page.route(/\/api\/show\/all(?:\?|$)/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, shows: [] }),
  }));

  return requests;
};

test('one Hero CTA click fetches and direct-plays a muted YouTube trailer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.__NITROCINE_HOME_TIMINGS__ = {
      loaderMs: 0,
      fadeMs: 0,
      posterWarmupMs: 0,
    };
  });
  const requests = await installBackend(page);
  await page.goto('/');

  const hero = page.locator('.hero-section');
  const trailerButton = hero.getByRole('button', { name: 'Trailer', exact: true });
  await expect(hero.locator('.hero-title')).toContainText(HERO_MOVIE.title);
  await expect(trailerButton).toBeVisible();
  expect(requests.metadata).toBe(0);
  expect(requests.iframeApi).toBe(0);

  // WebKit may scroll a partially clipped CTA as part of Playwright's
  // actionability step. Establish the baseline only after that normalization
  // so this assertion detects application-driven scrolling.
  await trailerButton.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => scrollY);
  await trailerButton.click();

  await expect.poll(() => requests.metadata).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__FAKE_YOUTUBE__?.constructorCount || 0)).toBe(1);
  await expect.poll(() => page.evaluate(() => (
    (window.__FAKE_YOUTUBE__?.loadVideoByIdCount || 0)
    + (window.__FAKE_YOUTUBE__?.playVideoCount || 0)
  ))).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__FAKE_YOUTUBE__?.state)).toBe(1);

  const sampleA = await page.evaluate(() => window.__FAKE_YOUTUBE__.currentTime());
  await page.waitForTimeout(250);
  const sampleB = await page.evaluate(() => window.__FAKE_YOUTUBE__.currentTime());
  expect(sampleB).toBeGreaterThan(sampleA);
  expect(await page.evaluate(() => window.__FAKE_YOUTUBE__.muteCount)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__FAKE_YOUTUBE__.iframeClickCount)).toBe(0);
  expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
  await expect(hero.locator('.hero-youtube-video button')).toHaveCount(0);
  await expect(hero.locator('.hero-youtube-video iframe')).toHaveCSS('pointer-events', 'none');
});
