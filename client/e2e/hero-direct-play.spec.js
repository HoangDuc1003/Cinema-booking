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
  title: 'Direct Play Hero',
  overview: 'A deterministic fixture for the Hero YouTube lifecycle.',
  backdrop_path: '/direct-play-backdrop.jpg',
  poster_path: '/direct-play-poster.jpg',
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
    destroyCount: 0,
    muteCount: 0,
    unMuteCount: 0,
    iframeClickCount: 0,
    state: PlayerState.UNSTARTED,
    videoId: '',
    playerVars: null,
    setOptionCalls: [],
    throwCaptionCommands: false,
    player: null,
  };

  class FakePlayer {
    constructor(element, config) {
      telemetry.constructorCount += 1;
      telemetry.playerVars = { ...(config.playerVars || {}) };
      telemetry.player = this;
      this.config = config;
      this.state = PlayerState.UNSTARTED;
      this.videoId = '';
      this.baseTime = 0;
      this.playStartedAt = 0;
      this.iframe = document.createElement('iframe');
      this.iframe.title = 'Deterministic fake YouTube trailer';
      this.iframe.addEventListener('click', () => {
        telemetry.iframeClickCount += 1;
      });
      element.replaceWith(this.iframe);

      setTimeout(() => {
        config.events?.onReady?.({ target: this });
        setTimeout(() => config.events?.onApiChange?.({ target: this }), 0);
      }, 0);
    }

    _currentTime() {
      if (this.state !== PlayerState.PLAYING) return this.baseTime;
      return this.baseTime + ((performance.now() - this.playStartedAt) / 1000);
    }

    _emit(state) {
      this.baseTime = this._currentTime();
      this.state = state;
      telemetry.state = state;
      if (state === PlayerState.PLAYING) this.playStartedAt = performance.now();
      this.config.events?.onStateChange?.({ data: state, target: this });
    }

    loadVideoById(request) {
      telemetry.loadVideoByIdCount += 1;
      this.videoId = typeof request === 'string' ? request : request.videoId;
      this.baseTime = Number(request?.startSeconds) || 0;
      telemetry.videoId = this.videoId;
      this._emit(PlayerState.BUFFERING);
      setTimeout(() => {
        if (telemetry.player === this && this.state === PlayerState.BUFFERING) this.playVideo();
      }, 120);
    }

    playVideo() {
      telemetry.playVideoCount += 1;
      this._emit(PlayerState.PLAYING);
    }

    pauseVideo() {
      this._emit(PlayerState.PAUSED);
    }

    mute() {
      telemetry.muteCount += 1;
    }

    unMute() {
      telemetry.unMuteCount += 1;
    }

    getPlayerState() {
      return this.state;
    }

    getCurrentTime() {
      return this._currentTime();
    }

    getVideoData() {
      return { video_id: this.videoId };
    }

    getIframe() {
      return this.iframe;
    }

    getOptions() {
      return ['captions'];
    }

    setOption(...args) {
      telemetry.setOptionCalls.push(args);
      if (telemetry.throwCaptionCommands) throw new Error('caption API unavailable');
    }

    destroy() {
      telemetry.destroyCount += 1;
      this.iframe.remove();
    }
  }

  telemetry.startPlayback = () => telemetry.player?.playVideo();
  telemetry.emitState = (state) => telemetry.player?._emit(state);
  telemetry.currentTime = () => telemetry.player?.getCurrentTime() || 0;

  window.__FAKE_YOUTUBE__ = telemetry;
  window.YT = { Player: FakePlayer, PlayerState };
  queueMicrotask(() => window.onYouTubeIframeAPIReady?.());
})();
`;

const installDeterministicBackend = async (page) => {
  const requestCounts = { metadata: 0, iframeApi: 0 };

  await page.route('https://www.youtube.com/iframe_api', (route) => {
    requestCounts.iframeApi += 1;
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
    requestCounts.metadata += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: HERO_MOVIE.id,
          results: [{
            id: 'direct-play-trailer',
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

  return requestCounts;
};

const expectVolumeControlAdjacentToTrailer = async (hero) => {
  const placement = await hero.evaluate((heroElement) => {
    const actions = heroElement.querySelector('.hero-actions');
    const actionChildren = Array.from(actions?.children || []);
    const trailerButton = actionChildren.find((element) => (
      element.matches('button') && /^(Trailer|Poster)$/.test(element.textContent.trim())
    ));
    const volumeButton = actions?.querySelector(':scope > .hero-control--icon');
    const trailerRect = trailerButton?.getBoundingClientRect();
    const volumeRect = volumeButton?.getBoundingClientRect();

    return {
      found: Boolean(actions && trailerButton && volumeButton && trailerRect && volumeRect),
      sameParent: trailerButton?.parentElement === actions && volumeButton?.parentElement === actions,
      immediatelyAfter: trailerButton?.nextElementSibling === volumeButton,
      centerDeltaY: trailerRect && volumeRect
        ? Math.abs(
          (trailerRect.top + (trailerRect.height / 2))
          - (volumeRect.top + (volumeRect.height / 2)),
        )
        : Number.POSITIVE_INFINITY,
      horizontalGap: trailerRect && volumeRect
        ? volumeRect.left - trailerRect.right
        : Number.POSITIVE_INFINITY,
      volumeWidth: volumeRect?.width || Number.POSITIVE_INFINITY,
    };
  });

  expect(placement.found).toBe(true);
  expect(placement.sameParent).toBe(true);
  expect(placement.immediatelyAfter).toBe(true);
  expect(placement.centerDeltaY).toBeLessThanOrEqual(2);
  expect(placement.horizontalGap).toBeGreaterThanOrEqual(0);
  expect(placement.horizontalGap).toBeLessThanOrEqual(16);
  expect(placement.volumeWidth).toBeLessThanOrEqual(48);
};

test('one Hero CTA click fetches once and direct-plays one masked YouTube player', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const requestCounts = await installDeterministicBackend(page);
  await page.goto('/');

  const hero = page.locator('.hero-section');
  const poster = hero.locator('.hero-poster-shell');
  const video = hero.locator('.hero-youtube-video');
  const trailerButton = hero.getByRole('button', { name: 'Trailer', exact: true });

  await expect(hero.locator('.hero-title')).toContainText(HERO_MOVIE.title);
  await expect(trailerButton).toBeVisible();
  expect(requestCounts.metadata).toBe(0);
  expect(requestCounts.iframeApi).toBe(0);

  await page.evaluate(() => {
    window.__heroTrailerClickCount = 0;
    const button = [...document.querySelectorAll('.hero-section button')]
      .find((candidate) => candidate.textContent.trim() === 'Trailer');
    button.addEventListener('click', () => {
      window.__heroTrailerClickCount += 1;
    });
  });

  const scrollBefore = await page.evaluate(() => scrollY);
  await trailerButton.click();

  await expect.poll(() => requestCounts.metadata).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__FAKE_YOUTUBE__?.constructorCount || 0)).toBe(1);
  await expect.poll(() => page.evaluate(() => (
    (window.__FAKE_YOUTUBE__?.loadVideoByIdCount || 0)
    + (window.__FAKE_YOUTUBE__?.playVideoCount || 0)
  ))).toBeGreaterThan(0);

  expect(await page.evaluate(() => window.__heroTrailerClickCount)).toBe(1);
  expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
  await expect(poster).toHaveClass(/is-visible/);
  await expect(video).not.toHaveClass(/is-visible/);

  // The player must keep painting below the opaque poster. If its own opacity
  // starts at zero, Chromium can defer the first cross-origin paint and expose
  // YouTube's centre bezel exactly when the reveal begins.
  const maskedSurface = await hero.evaluate((heroElement) => {
    const posterElement = heroElement.querySelector('.hero-poster-shell');
    const videoElement = heroElement.querySelector('.hero-youtube-video');
    const mountElement = heroElement.querySelector('.hero-youtube-video__mount');
    const heroRect = heroElement.getBoundingClientRect();
    const mountRect = mountElement?.getBoundingClientRect();
    return {
      posterOpacity: getComputedStyle(posterElement).opacity,
      posterZIndex: Number(getComputedStyle(posterElement).zIndex),
      videoOpacity: getComputedStyle(videoElement).opacity,
      videoZIndex: Number(getComputedStyle(videoElement).zIndex),
      overscanRatio: mountRect ? mountRect.height / heroRect.height : 0,
      mountAspectRatio: mountRect ? mountRect.width / mountRect.height : 0,
      centerDeltaX: mountRect
        ? Math.abs((mountRect.left + (mountRect.width / 2)) - (heroRect.left + (heroRect.width / 2)))
        : Number.POSITIVE_INFINITY,
      centerDeltaY: mountRect
        ? Math.abs((mountRect.top + (mountRect.height / 2)) - (heroRect.top + (heroRect.height / 2)))
        : Number.POSITIVE_INFINITY,
    };
  });
  expect(maskedSurface.posterOpacity).toBe('1');
  expect(maskedSurface.videoOpacity).toBe('1');
  expect(maskedSurface.posterZIndex).toBeGreaterThan(maskedSurface.videoZIndex);
  // A 2.39:1 picture fitted inside YouTube's 16:9 surface occupies only
  // 74.4% of its height. This minimum uniform overscan pushes both encoded
  // black bands beyond the Hero viewport without a bottom-only crop.
  expect(maskedSurface.overscanRatio).toBeGreaterThanOrEqual(2.39 / (16 / 9));
  expect(maskedSurface.mountAspectRatio).toBeCloseTo(16 / 9, 2);
  expect(maskedSurface.centerDeltaX).toBeLessThan(2);
  expect(maskedSurface.centerDeltaY).toBeLessThan(2);

  await expect.poll(() => page.evaluate(() => window.__FAKE_YOUTUBE__.state)).toBe(1);
  await page.waitForTimeout(500);
  await expect(poster).toHaveClass(/is-visible/);
  await expect(poster).toHaveCSS('opacity', '1');
  await expect(video).not.toHaveClass(/is-visible/);
  await expect(poster).toHaveClass(/is-hidden/, { timeout: 6_000 });
  await expect(video).toHaveClass(/is-visible/);
  await expect(hero.getByRole('button', { name: 'Poster', exact: true })).toBeVisible();
  await expect(hero.getByRole('button', { name: 'Turn trailer sound on', exact: true })).toBeVisible();
  await expectVolumeControlAdjacentToTrailer(hero);

  const sampleA = await page.evaluate(() => window.__FAKE_YOUTUBE__.currentTime());
  await page.waitForTimeout(300);
  const sampleB = await page.evaluate(() => window.__FAKE_YOUTUBE__.currentTime());
  expect(sampleB).toBeGreaterThan(sampleA);

  const telemetry = await page.evaluate(() => {
    const fake = window.__FAKE_YOUTUBE__;
    return {
      constructorCount: fake.constructorCount,
      loadVideoByIdCount: fake.loadVideoByIdCount,
      playVideoCount: fake.playVideoCount,
      iframeClickCount: fake.iframeClickCount,
      muteCount: fake.muteCount,
      playerVars: fake.playerVars,
      setOptionCalls: fake.setOptionCalls,
    };
  });
  expect(telemetry.constructorCount).toBe(1);
  expect(telemetry.loadVideoByIdCount + telemetry.playVideoCount).toBeGreaterThan(0);
  expect(telemetry.iframeClickCount).toBe(0);
  expect(telemetry.muteCount).toBeGreaterThan(0);
  expect(telemetry.playerVars).toMatchObject({
    autoplay: 0,
    controls: 0,
    disablekb: 1,
    fs: 0,
    iv_load_policy: 3,
    playsinline: 1,
    rel: 0,
    enablejsapi: 1,
    cc_load_policy: 0,
  });
  expect(telemetry.playerVars).not.toHaveProperty('cc_lang_pref');
  expect(telemetry.setOptionCalls.length).toBeGreaterThanOrEqual(5);
  expect(telemetry.setOptionCalls).toEqual(expect.arrayContaining([
    ['captions', 'track', {}],
  ]));

  await expect(page.locator('.cinematic-center-btn')).toHaveCount(0);
  await expect(video.locator('button')).toHaveCount(0);
  await expect(hero.getByRole('button', { name: /^(Play|Pause)$/ })).toHaveCount(0);
  const iframe = video.locator('iframe');
  await expect(iframe).toHaveCSS('pointer-events', 'none');

  await page.evaluate(() => window.__FAKE_YOUTUBE__.emitState(window.YT.PlayerState.PAUSED));
  await expect(poster).toHaveClass(/is-visible/);
  await expect(video).not.toHaveClass(/is-visible/);

  await page.evaluate(() => window.__FAKE_YOUTUBE__.startPlayback());
  await expect(poster).toHaveClass(/is-hidden/, { timeout: 6_000 });
  await expect(video).toHaveClass(/is-visible/);

  await page.evaluate(() => window.__FAKE_YOUTUBE__.emitState(window.YT.PlayerState.BUFFERING));
  await expect(poster).toHaveClass(/is-visible/);
  await expect(video).not.toHaveClass(/is-visible/);
});

test('caption API failures do not interrupt direct playback', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const requestCounts = await installDeterministicBackend(page);
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Trailer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Trailer', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__FAKE_YOUTUBE__?.constructorCount || 0)).toBe(1);
  await page.evaluate(() => {
    window.__FAKE_YOUTUBE__.throwCaptionCommands = true;
  });

  await expect(page.locator('.hero-youtube-video')).toHaveClass(/is-visible/, { timeout: 6_000 });
  await expect(page.locator('.hero-poster-shell')).toHaveClass(/is-hidden/);
  expect(requestCounts.metadata).toBe(1);
  expect(await page.evaluate(() => window.__FAKE_YOUTUBE__.state)).toBe(1);
  expect(await page.evaluate(() => window.__FAKE_YOUTUBE__.currentTime())).toBeGreaterThan(0);
});

test('mobile Hero stays poster-only before the CTA click', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requestCounts = await installDeterministicBackend(page);
  await page.goto('/');

  await expect(page.locator('.hero-title')).toContainText(HERO_MOVIE.title);
  await expect(page.getByRole('button', { name: 'Trailer', exact: true })).toBeVisible();
  await page.waitForTimeout(250);

  expect(requestCounts.metadata).toBe(0);
  expect(requestCounts.iframeApi).toBe(0);
  await expect(page.locator('.hero-youtube-video')).toHaveCount(0);
  await expect(page.locator('.hero-poster-shell')).toHaveClass(/is-visible/);
});

test('mobile stable playback keeps volume immediately beside the Poster CTA', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installDeterministicBackend(page);
  await page.goto('/');

  const hero = page.locator('.hero-section');
  await hero.getByRole('button', { name: 'Trailer', exact: true }).click();

  await expect(hero.locator('.hero-youtube-video')).toHaveClass(/is-visible/, { timeout: 6_000 });
  await expect(hero.getByRole('button', { name: 'Poster', exact: true })).toBeVisible();
  await expect(hero.getByRole('button', { name: 'Turn trailer sound on', exact: true })).toBeVisible();
  await expectVolumeControlAdjacentToTrailer(hero);
});
