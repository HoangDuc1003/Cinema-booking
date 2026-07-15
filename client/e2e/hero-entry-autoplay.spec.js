import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0xkAAAAASUVORK5CYII=',
  'base64',
);

const VIDEO_ID = 'abcdefghijk';
const MIN_APPROX_THREE_SECONDS_MS = 2_900;
const MIN_APPROX_TWO_SECONDS_MS = 1_900;
const HERO_MOVIE = {
  id: 424242,
  _id: '424242',
  title: 'Entry Autoplay Hero',
  overview: 'A deterministic fixture for the entry loader and poster quarantine.',
  backdrop_path: '/entry-autoplay-backdrop.jpg',
  poster_path: '/entry-autoplay-poster.jpg',
  release_date: '2026-07-01',
  runtime: 118,
  vote_average: 8.4,
  genres: [{ id: 1, name: 'Drama' }],
};

const HERO_MOVIES = [
  HERO_MOVIE,
  ...Array.from({ length: 4 }, (_, index) => ({
    ...HERO_MOVIE,
    id: HERO_MOVIE.id + index + 1,
    _id: String(HERO_MOVIE.id + index + 1),
    title: `Prefetched Hero ${index + 2}`,
    backdrop_path: `/prefetched-hero-${index + 2}.jpg`,
    poster_path: `/prefetched-hero-${index + 2}-poster.jpg`,
  })),
];

const VIDEO_ID_BY_MOVIE_ID = new Map(HERO_MOVIES.map((movie, index) => [
  String(movie.id),
  index === 0 ? VIDEO_ID : `abcdefghij${index}`,
]));

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
    unMuteCount: 0,
    iframeClickCount: 0,
    state: PlayerState.UNSTARTED,
    muted: false,
    events: [],
    player: null,
  };

  const record = (type, detail = {}) => {
    telemetry.events.push({ type, at: performance.now(), ...detail });
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
      this.iframe.title = 'Fake non-interactive YouTube player';
      this.iframe.addEventListener('click', () => {
        telemetry.iframeClickCount += 1;
      });
      element.replaceWith(this.iframe);
      record('constructor');
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
      record('state', { state });
      this.config.events?.onStateChange?.({ data: state, target: this });
    }

    loadVideoById(request) {
      telemetry.loadVideoByIdCount += 1;
      this.videoId = typeof request === 'string' ? request : request.videoId;
      this.baseTime = Number(request?.startSeconds) || 0;
      record('loadVideoById', { muted: telemetry.muted, videoId: this.videoId });
      this.emit(PlayerState.BUFFERING);
      setTimeout(() => {
        if (this.state === PlayerState.BUFFERING) this.playVideo();
      }, 40);
    }

    playVideo() {
      telemetry.playVideoCount += 1;
      record('playVideo', { muted: telemetry.muted });
      this.emit(PlayerState.PLAYING);
    }

    pauseVideo() {
      this.emit(PlayerState.PAUSED);
    }

    mute() {
      telemetry.muteCount += 1;
      telemetry.muted = true;
      record('mute');
    }

    unMute() {
      telemetry.unMuteCount += 1;
      if (window.__FAKE_YOUTUBE_BLOCK_UNMUTE__ === true) {
        telemetry.muted = true;
        record('unMuteBlocked');
        return;
      }
      telemetry.muted = false;
      record('unMute');
    }

    setVolume(volume) {
      telemetry.volume = volume;
      record('setVolume', { volume });
    }

    isMuted() { return telemetry.muted; }
    getPlayerState() { return this.state; }
    getVideoData() { return { video_id: this.videoId }; }
    getIframe() { return this.iframe; }
    getOptions() { return ['captions']; }
    setOption() {}
    destroy() { this.iframe.remove(); }
  }

  telemetry.currentTime = () => telemetry.player?.getCurrentTime() || 0;
  telemetry.forceState = (state) => telemetry.player?.emit(state);
  window.__FAKE_YOUTUBE__ = telemetry;
  window.YT = { Player: FakePlayer, PlayerState };
  queueMicrotask(() => window.onYouTubeIframeAPIReady?.());
})();
`;

const installTimelineProbe = async (page) => {
  await page.addInitScript(() => {
    const timeline = {
      loaderFirstSeenAt: null,
      loaderRemovedAt: null,
      introCompleteAt: null,
      posterWarmupCompleteAt: null,
      videoSafeAt: null,
    };
    let loaderWasPresent = false;
    let stopped = false;

    const sample = () => {
      if (stopped) return;
      const now = performance.now();
      const loaderPresent = Boolean(document.querySelector('[data-testid="home-entry-loader"]'));
      const hero = document.querySelector('.hero-section');
      const video = document.querySelector('.hero-youtube-video');

      if (loaderPresent && timeline.loaderFirstSeenAt == null) {
        timeline.loaderFirstSeenAt = now;
      }
      if (!loaderPresent && loaderWasPresent && timeline.loaderRemovedAt == null) {
        timeline.loaderRemovedAt = now;
      }
      if (hero?.dataset.introComplete === 'true' && timeline.introCompleteAt == null) {
        timeline.introCompleteAt = now;
      }
      if (
        hero?.dataset.posterWarmupComplete === 'true'
        && timeline.posterWarmupCompleteAt == null
      ) {
        timeline.posterWarmupCompleteAt = now;
      }
      if (video?.dataset.videoSafe === 'true' && timeline.videoSafeAt == null) {
        timeline.videoSafeAt = now;
      }

      loaderWasPresent = loaderPresent;
      window.requestAnimationFrame(sample);
    };

    window.__HERO_ENTRY_TIMELINE__ = timeline;
    window.addEventListener('pagehide', () => { stopped = true; }, { once: true });
    window.requestAnimationFrame(sample);
  });
};

const installBackend = async (page, { movies = [HERO_MOVIE] } = {}) => {
  const requests = { metadata: 0, metadataMovieIds: [], iframeApi: 0 };

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
  await page.route(/\/api\/show\/hero(?:\?|$)/, async (route) => {
    // Make the real catalog settle after the initial dummy render. An auto-start
    // must never lock playback to a dummy movie while this request is pending.
    await new Promise((resolve) => setTimeout(resolve, 120));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, settings: {}, movies }),
    });
  });
  await page.route(/\/api\/show\/tmdb\/movie\/[^/]+\/videos(?:\?|$)/, (route) => {
    const requestUrl = new URL(route.request().url());
    const movieId = requestUrl.pathname.match(/\/movie\/([^/]+)\/videos$/)?.[1] || '';
    requests.metadata += 1;
    requests.metadataMovieIds.push(movieId);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: Number(movieId),
          results: [{
            id: 'official-trailer',
            key: VIDEO_ID_BY_MOVIE_ID.get(movieId) || VIDEO_ID,
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

test('entry loader preplays muted, holds the poster, reveals with sound, and remasks unstable playback', async ({ page }) => {
  test.setTimeout(20_000);
  const viewport = { width: 944, height: 880 };
  await page.setViewportSize(viewport);
  await installTimelineProbe(page);
  const requests = await installBackend(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const loader = page.getByTestId('home-entry-loader');
  const hero = page.locator('.hero-section');
  const poster = hero.locator('.hero-poster-shell');
  const video = hero.locator('.hero-youtube-video');

  await expect(loader).toBeVisible();
  await expect(loader.locator('.home-boot-loader__spinner')).toHaveCount(1);
  await expect(loader.locator('.home-boot-loader__message')).toHaveText('Loading');
  await expect(loader.locator('img, .home-boot-loader__progress')).toHaveCount(0);
  await expect(hero).toHaveAttribute('data-intro-complete', 'false');
  await expect(hero).toHaveAttribute('data-poster-warmup-complete', 'false');
  const loaderBox = await loader.boundingBox();
  expect(loaderBox).not.toBeNull();
  expect(loaderBox.x).toBeLessThanOrEqual(1);
  expect(loaderBox.y).toBeLessThanOrEqual(1);
  expect(loaderBox.width).toBeGreaterThanOrEqual(viewport.width - 2);
  expect(loaderBox.height).toBeGreaterThanOrEqual(viewport.height - 2);

  // Preloading is automatic. It requires no CTA or iframe interaction, and
  // real playback starts muted while the full-screen entry loader masks it.
  await expect.poll(() => requests.metadata).toBe(1);
  expect(requests.metadataMovieIds).toEqual([String(HERO_MOVIE.id)]);
  await expect(hero.locator('.hero-title')).toContainText(HERO_MOVIE.title);
  await expect.poll(() => requests.iframeApi).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__FAKE_YOUTUBE__?.constructorCount || 0)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__FAKE_YOUTUBE__?.state)).toBe(1);
  await expect(loader).toBeVisible();
  expect(await page.evaluate(() => window.__FAKE_YOUTUBE__.muted)).toBe(true);
  expect(await page.evaluate(() => {
    const events = window.__FAKE_YOUTUBE__.events;
    return events.findIndex(({ type }) => type === 'mute')
      < events.findIndex(({ type }) => type === 'loadVideoById');
  })).toBe(true);

  const hiddenSampleA = await page.evaluate(() => window.__FAKE_YOUTUBE__.currentTime());
  await page.waitForTimeout(200);
  const hiddenSampleB = await page.evaluate(() => window.__FAKE_YOUTUBE__.currentTime());
  expect(hiddenSampleB).toBeGreaterThan(hiddenSampleA);
  await expect(video).toHaveAttribute('data-video-safe', 'false');

  // The entry screen lasts about three seconds. Once it leaves, the poster gets
  // its own two-second warmup; a ready/playing iframe cannot bypass either gate.
  await expect(loader).toHaveCount(0);
  await expect(hero).toHaveAttribute('data-intro-complete', 'true');
  await expect(poster).toHaveClass(/is-visible/);
  await expect(video).toHaveAttribute('data-video-safe', 'false');
  await page.waitForTimeout(1_000);
  await expect(poster).toHaveClass(/is-visible/);
  await expect(video).toHaveAttribute('data-video-safe', 'false');
  expect(await page.evaluate(() => window.__FAKE_YOUTUBE__.muted)).toBe(true);
  expect(await page.evaluate(() => window.__FAKE_YOUTUBE__.unMuteCount)).toBe(0);

  await expect(hero).toHaveAttribute('data-poster-warmup-complete', 'true');
  await expect(video).toHaveAttribute('data-video-safe', 'true');
  await expect(poster).toHaveClass(/is-hidden/);

  const timeline = await page.evaluate(() => window.__HERO_ENTRY_TIMELINE__);
  expect(timeline.loaderFirstSeenAt).not.toBeNull();
  expect(timeline.loaderRemovedAt - timeline.loaderFirstSeenAt)
    .toBeGreaterThanOrEqual(MIN_APPROX_THREE_SECONDS_MS);
  expect(timeline.videoSafeAt - timeline.loaderRemovedAt)
    .toBeGreaterThanOrEqual(MIN_APPROX_TWO_SECONDS_MS);

  // Sound-on is best effort because real browsers may reject an unmute without
  // a user gesture. This fake accepts it, so the successful path must unmute at reveal.
  await expect.poll(() => page.evaluate(() => window.__FAKE_YOUTUBE__.unMuteCount)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__FAKE_YOUTUBE__.muted)).toBe(false);

  const posterButton = hero.getByRole('button', { name: 'Poster', exact: true });
  const volumeButton = hero.getByRole('button', { name: 'Mute trailer', exact: true });
  await expect(posterButton).toBeVisible();
  await expect(volumeButton).toBeVisible();
  const posterButtonBox = await posterButton.boundingBox();
  const volumeButtonBox = await volumeButton.boundingBox();
  expect(posterButtonBox).not.toBeNull();
  expect(volumeButtonBox).not.toBeNull();
  expect(Math.abs(volumeButtonBox.y - posterButtonBox.y)).toBeLessThanOrEqual(2);
  expect(volumeButtonBox.x).toBeGreaterThan(posterButtonBox.x + posterButtonBox.width);
  expect(volumeButtonBox.x - (posterButtonBox.x + posterButtonBox.width)).toBeLessThanOrEqual(24);

  // There is never an app-owned center Play/Pause affordance or an interactive Hero iframe.
  await expect(page.locator('.cinematic-center-btn')).toHaveCount(0);
  await expect(video.locator('button')).toHaveCount(0);
  await expect(hero.getByRole('button', { name: /^(Play|Pause)$/i })).toHaveCount(0);
  await expect(video.locator('iframe')).toHaveCSS('pointer-events', 'none');
  expect(await page.evaluate(() => window.__FAKE_YOUTUBE__.iframeClickCount)).toBe(0);

  // PAUSED and BUFFERING immediately restore the poster. Playback must pass the
  // existing stability quarantine again before the iframe is revealed.
  await page.evaluate(() => window.__FAKE_YOUTUBE__.forceState(window.YT.PlayerState.PAUSED));
  await expect(poster).toHaveClass(/is-visible/);
  await expect(video).toHaveAttribute('data-video-safe', 'false');
  // Let React commit the pause/remask effects before delivering the synthetic
  // recovery event. Real YouTube state transitions are never in the same task.
  await page.waitForTimeout(100);

  await page.evaluate(() => window.__FAKE_YOUTUBE__.forceState(window.YT.PlayerState.PLAYING));
  await expect(video).toHaveAttribute('data-video-safe', 'true', { timeout: 8_000 });
  await expect(poster).toHaveClass(/is-hidden/, { timeout: 8_000 });

  await page.evaluate(() => window.__FAKE_YOUTUBE__.forceState(window.YT.PlayerState.BUFFERING));
  await expect(poster).toHaveClass(/is-visible/);
  await expect(video).toHaveAttribute('data-video-safe', 'false');
});

test('blocked unmute keeps stable playback visible and exposes the sound control', async ({ page }) => {
  test.setTimeout(15_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.__NITROCINE_HOME_TIMINGS__ = {
      loaderMs: 0,
      fadeMs: 0,
      posterWarmupMs: 0,
    };
    window.__FAKE_YOUTUBE_BLOCK_UNMUTE__ = true;
  });
  const requests = await installBackend(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const hero = page.locator('.hero-section');
  const poster = hero.locator('.hero-poster-shell');
  const video = hero.locator('.hero-youtube-video');

  await expect.poll(() => requests.metadata).toBe(1);
  expect(requests.metadataMovieIds).toEqual([String(HERO_MOVIE.id)]);
  await expect.poll(() => page.evaluate(() => window.__FAKE_YOUTUBE__?.state)).toBe(1);
  await expect(video).toHaveAttribute('data-video-safe', 'true');
  await expect(poster).toHaveClass(/is-hidden/);

  await expect.poll(() => page.evaluate(() => window.__FAKE_YOUTUBE__?.unMuteCount || 0))
    .toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__FAKE_YOUTUBE__?.muted)).toBe(true);
  await expect(hero.getByRole('button', { name: 'Turn trailer sound on', exact: true })).toBeVisible();

  const sampleA = await page.evaluate(() => window.__FAKE_YOUTUBE__.currentTime());
  await page.waitForTimeout(250);
  const sampleB = await page.evaluate(() => window.__FAKE_YOUTUBE__.currentTime());
  expect(sampleB).toBeGreaterThan(sampleA);
  expect(await page.evaluate(() => window.__FAKE_YOUTUBE__.state)).toBe(1);

  // Falling back to muted playback must not close the visual latch or expose
  // any app-owned center transport control.
  await expect(video).toHaveAttribute('data-video-safe', 'true');
  await expect(poster).toHaveClass(/is-hidden/);
  await expect(page.locator('.cinematic-center-btn')).toHaveCount(0);
  await expect(video.locator('button')).toHaveCount(0);
  await expect(hero.getByRole('button', { name: /^(Play|Pause)$/i })).toHaveCount(0);
  await expect(video.locator('iframe')).toHaveCSS('pointer-events', 'none');
  expect(await page.evaluate(() => window.__FAKE_YOUTUBE__.iframeClickCount)).toBe(0);
});

test('first stable trailer prefetches the other four sources while keeping one active player', async ({ page }) => {
  test.setTimeout(20_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.__NITROCINE_HOME_TIMINGS__ = {
      loaderMs: 0,
      fadeMs: 0,
      posterWarmupMs: 0,
    };
  });
  const requests = await installBackend(page, { movies: HERO_MOVIES });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const hero = page.locator('.hero-section');
  const video = hero.locator('.hero-youtube-video');
  await expect(video).toHaveAttribute('data-video-safe', 'true', { timeout: 8_000 });

  await expect.poll(() => requests.metadata).toBe(HERO_MOVIES.length);
  expect([...requests.metadataMovieIds].sort()).toEqual(
    HERO_MOVIES.map((movie) => String(movie.id)).sort(),
  );
  expect(await page.evaluate(() => window.__FAKE_YOUTUBE__.constructorCount)).toBe(1);
  await expect(video.locator('iframe')).toHaveCount(1);

  await hero.locator('.hero-poster-thumb').nth(1).click();
  await expect.poll(() => page.evaluate(() => window.__FAKE_YOUTUBE__.constructorCount)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.__FAKE_YOUTUBE__.loadVideoByIdCount))
    .toBeGreaterThanOrEqual(2);
  await expect.poll(() => page.evaluate(() => window.__FAKE_YOUTUBE__.player?.videoId || ''))
    .toBe(VIDEO_ID_BY_MOVIE_ID.get(String(HERO_MOVIES[1].id)));

  // Switching uses the cached source: no sixth metadata request and no pool of
  // hidden decoders remains mounted.
  expect(requests.metadata).toBe(HERO_MOVIES.length);
  await expect(hero.locator('.hero-youtube-video iframe')).toHaveCount(1);
});

test('compact content keeps the requested identity and actions, then holds hover for three seconds', async ({ page }) => {
  test.setTimeout(20_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.__NITROCINE_HOME_TIMINGS__ = {
      loaderMs: 0,
      fadeMs: 0,
      posterWarmupMs: 0,
    };
  });
  await installBackend(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const hero = page.locator('.hero-section');
  const content = hero.locator('.hero-content-zone');
  const overview = content.locator('.hero-overview');

  await expect(hero.locator('.hero-youtube-video')).toHaveAttribute('data-video-safe', 'true');
  await expect(content).toHaveClass(/is-compact/, { timeout: 10_000 });

  await expect(content.locator('.hero-title')).toBeVisible();
  await expect(content.locator('.hero-genres')).toBeVisible();
  await expect(content.locator('.hero-meta')).toBeVisible();
  await expect(content.getByRole('button', { name: 'Book Now', exact: true })).toBeVisible();
  await expect(content.getByRole('button', { name: 'Poster', exact: true })).toBeVisible();
  await expect(content.getByRole('button', { name: 'Mute trailer', exact: true })).toBeVisible();
  await expect(overview).toHaveAttribute('aria-hidden', 'true');
  await expect(overview).toHaveCSS('max-height', '0px');
  await expect(content).toHaveCSS('background-image', 'none');
  await expect(content).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  await content.hover();
  await expect(content).toHaveClass(/is-expanded/, { timeout: 2_000 });
  await expect(overview).toHaveAttribute('aria-hidden', 'false');

  await page.mouse.move(1400, 100);
  await page.waitForTimeout(2_500);
  await expect(content).toHaveClass(/is-expanded/);
  await expect(content).toHaveClass(/is-compact/, { timeout: 1_500 });
});
