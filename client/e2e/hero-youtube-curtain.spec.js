import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const VIDEO_ID = 'WpW36ldAqnM';
const HERO_MOVIE = {
  id: 424245,
  _id: '424245',
  title: 'Cinematic Curtain Hero',
  overview: 'A deterministic fixture for the YouTube curtain reveal.',
  videoId: VIDEO_ID,
  backdrop_path: '/curtain-backdrop.jpg',
  poster_path: '/curtain-poster.jpg',
  release_date: '2026-07-01',
  runtime: 118,
  vote_average: 8.4,
  genres: [{ id: 1, name: 'Drama' }],
};

const HERO_MOVIES = [
  ['WpW36ldAqnM', 'Cinematic Curtain Hero'],
  ['TcMBFSGVi1c', 'Second Feature'],
  ['k64P4l2WacU', 'Third Feature'],
  ['d9MyW72ELq0', 'Fourth Feature'],
  ['Way9Dexny3w', 'Fifth Feature'],
].map(([videoId, title], index) => ({
  ...HERO_MOVIE,
  id: HERO_MOVIE.id + index,
  _id: String(HERO_MOVIE.id + index),
  title,
  videoId,
  backdrop_path: `/curtain-backdrop-${index + 1}.jpg`,
  poster_path: `/curtain-poster-${index + 1}.jpg`,
}));

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0xkAAAAASUVORK5CYII=',
  'base64',
);

async function installYouTubePlayer(page, {
  stuck = false,
  reducedMotion = 'no-preference',
  saveData = false,
  movies = [HERO_MOVIE],
} = {}) {
  await page.emulateMedia({ reducedMotion });
  await page.addInitScript(({ shouldStick, shouldSaveData }) => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: shouldSaveData },
      configurable: true,
    });

    const startedAt = Date.now();
    const diagnostics = {
      configs: [],
      contentStates: [],
      curtainStates: [],
      events: [],
      players: [],
      startedAt,
    };
    window.__FAKE_YOUTUBE__ = diagnostics;

    let lastCurtainClass = '';
    let lastContentClass = '';
    const curtainObserver = new MutationObserver(() => {
      const curtain = document.querySelector('.hero-curtain-overlay');
      const className = curtain?.className || '';
      if (className && className !== lastCurtainClass) {
        lastCurtainClass = className;
        diagnostics.curtainStates.push({
          at: Date.now() - startedAt,
          className,
          animationDuration: curtain.querySelector('.hero-curtain-left')
            ? getComputedStyle(curtain.querySelector('.hero-curtain-left')).animationDuration
            : '',
        });
      }

      const content = document.querySelector('.hero-content-zone');
      const contentClassName = content?.className || '';
      if (contentClassName && contentClassName !== lastContentClass) {
        lastContentClass = contentClassName;
        const contentStyle = getComputedStyle(content);
        diagnostics.contentStates.push({
          at: Date.now() - startedAt,
          className: contentClassName,
          animationDuration: contentStyle.animationDuration,
          animationName: contentStyle.animationName,
        });
      }
    });
    curtainObserver.observe(document, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true,
    });

    class FakePlayer {
      constructor(element, config) {
        this.instanceId = diagnostics.players.length;
        this.config = config;
        this.events = config.events || {};
        this.videoId = config.videoId || '';
        this.currentTime = Number(config.playerVars?.start) || 0;
        this.playerState = -1;
        this.muted = true;
        this.volume = 0;
        this.timerId = null;

        this.iframe = document.createElement('iframe');
        this.iframe.title = 'YouTube video player';
        this.iframe.srcdoc = '<!doctype html><html><body></body></html>';
        element.replaceChildren(this.iframe);

        diagnostics.configs.push(config.playerVars || {});
        diagnostics.players.push(this);
        window.setTimeout(() => this.events.onReady?.({ target: this }), 0);
      }

      startPlayback() {
        if (shouldStick || this.timerId != null) return;
        this.playerState = 1;
        this.events.onStateChange?.({ data: 1, target: this });
        this.timerId = window.setInterval(() => {
          this.currentTime += 0.1;
        }, 100);
      }

      loadVideoById(request) {
        this.videoId = request.videoId;
        this.currentTime = Number(request.startSeconds) || 0;
        this.startPlayback();
      }

      playVideo() { this.startPlayback(); }
      pauseVideo() { this.playerState = 2; }
      mute() { this.muted = true; diagnostics.events.push({ kind: 'mute', player: this.instanceId, at: Date.now() - startedAt }); }
      unMute() { this.muted = false; diagnostics.events.push({ kind: 'unmute', player: this.instanceId, at: Date.now() - startedAt }); }
      isMuted() { return this.muted; }
      setVolume(value) {
        this.volume = Number(value);
        diagnostics.events.push({ kind: 'volume', player: this.instanceId, value: this.volume, at: Date.now() - startedAt });
      }
      getCurrentTime() { return this.currentTime; }
      getPlayerState() { return this.playerState; }
      getVideoData() { return { video_id: this.videoId }; }
      getIframe() { return this.iframe; }
      getOptions() { return []; }
      destroy() {
        window.clearInterval(this.timerId);
        this.timerId = null;
        this.iframe.remove();
      }
    }

    window.YT = {
      Player: FakePlayer,
      PlayerState: {
        UNSTARTED: -1,
        ENDED: 0,
        PLAYING: 1,
        PAUSED: 2,
        BUFFERING: 3,
        CUED: 5,
      },
    };
  }, { shouldStick: stuck, shouldSaveData: saveData });

  await page.route(/\/api\/show\/hero(?:\?|$)/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, movies }),
  }));
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
}

test.describe('YouTube cinematic curtain reveal', () => {
  test('masks player chrome, proves playback, then fades audio to 60', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installYouTubePlayer(page);
    await page.goto('/');

    const hero = page.locator('.hero-section');
    const curtain = hero.locator('.hero-curtain-overlay');
    const playerShell = hero.locator('.hero-youtube-video');

    await expect(curtain).toHaveClass(/is-closed/);
    await expect(hero.locator('iframe')).toHaveCount(1);
    await expect(hero.locator('video')).toHaveCount(0);
    await expect(playerShell).not.toHaveClass(/is-visible/);
    await expect(playerShell).toHaveCSS('opacity', '0');

    const beforeReveal = await page.evaluate(() => ({
      time: window.__FAKE_YOUTUBE__.players[0].getCurrentTime(),
      unmuteCount: window.__FAKE_YOUTUBE__.events.filter((event) => event.kind === 'unmute').length,
      vars: window.__FAKE_YOUTUBE__.configs[0],
    }));
    await page.waitForTimeout(350);
    const advancingTime = await page.evaluate(() => window.__FAKE_YOUTUBE__.players[0].getCurrentTime());

    expect(advancingTime).toBeGreaterThan(beforeReveal.time);
    expect(beforeReveal.unmuteCount).toBe(0);
    expect(beforeReveal.vars).toMatchObject({
      autoplay: 1,
      mute: 1,
      controls: 0,
      playsinline: 1,
      enablejsapi: 1,
    });

    await expect(curtain).toHaveClass(/is-opening/, { timeout: 3_500 });
    await expect(curtain).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(curtain).toHaveClass(/is-open/, { timeout: 2_500 });
    await expect(playerShell).toHaveClass(/is-visible/);
    await expect(playerShell).toHaveCSS('opacity', '1');
    await expect(curtain).toHaveCount(0, { timeout: 1_000 });

    await expect.poll(async () => page.evaluate(() => {
      const player = window.__FAKE_YOUTUBE__.players[0];
      return { muted: player.isMuted(), volume: player.volume };
    }), { timeout: 2_000 }).toEqual({ muted: false, volume: 60 });

    const revealTiming = await page.evaluate(() => {
      const openState = window.__FAKE_YOUTUBE__.curtainStates.find((entry) => (
        entry.className.split(/\s+/).includes('is-open')
      ));
      const unmuteEvent = window.__FAKE_YOUTUBE__.events.find((event) => event.kind === 'unmute');
      const fullVolumeEvent = window.__FAKE_YOUTUBE__.events.find((event) => (
        event.kind === 'volume' && event.value === 60 && event.at >= unmuteEvent.at
      ));
      return {
        audioDelay: unmuteEvent.at - openState.at,
        fadeDuration: fullVolumeEvent.at - unmuteEvent.at,
      };
    });
    expect(revealTiming.audioDelay).toBeGreaterThanOrEqual(150);
    expect(revealTiming.audioDelay).toBeLessThan(800);
    expect(revealTiming.fadeDuration).toBeGreaterThanOrEqual(700);
    expect(revealTiming.fadeDuration).toBeLessThan(1_400);
  });

  test('uses a 200ms curtain motion for reduced-motion users', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installYouTubePlayer(page, { reducedMotion: 'reduce' });
    await page.goto('/');

    const curtain = page.locator('.hero-curtain-overlay');
    await expect(curtain).toHaveCount(0, { timeout: 4_000 });

    const curtainStates = await page.evaluate(() => window.__FAKE_YOUTUBE__.curtainStates);
    const openingState = curtainStates.find((entry) => entry.className.split(/\s+/).includes('is-opening'));
    const openState = curtainStates.find((entry) => entry.className.split(/\s+/).includes('is-open'));
    expect(openingState).toBeTruthy();
    expect(openingState.animationDuration).toBe('0.2s');
    expect(openState.at - openingState.at).toBeGreaterThanOrEqual(150);
    expect(openState.at - openingState.at).toBeLessThan(600);
  });

  test('keeps a manual trailer attempt muted until its curtain opens', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installYouTubePlayer(page, { saveData: true });
    await page.goto('/');

    const hero = page.locator('.hero-section');
    await expect(hero.locator('iframe')).toHaveCount(0);
    await hero.getByRole('button', { name: 'Trailer', exact: true }).click();

    const curtain = hero.locator('.hero-curtain-overlay');
    await expect(curtain).toHaveClass(/is-closed/);
    await expect(hero.locator('iframe')).toHaveCount(1);
    await page.waitForTimeout(350);

    const beforeOpening = await page.evaluate(() => ({
      muted: window.__FAKE_YOUTUBE__.players[0].isMuted(),
      unmuteCount: window.__FAKE_YOUTUBE__.events.filter((event) => event.kind === 'unmute').length,
    }));
    expect(beforeOpening).toEqual({ muted: true, unmuteCount: 0 });

    await expect(curtain).toHaveClass(/is-open/, { timeout: 5_500 });
    await expect.poll(async () => page.evaluate(() => {
      const player = window.__FAKE_YOUTUBE__.players[0];
      return { muted: player.isMuted(), volume: player.volume };
    }), { timeout: 5_000 }).toEqual({ muted: false, volume: 60 });
  });

  test('keeps five thumbnails available and restores description gestures across trailers', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installYouTubePlayer(page, { movies: HERO_MOVIES });
    await page.goto('/');

    const hero = page.locator('.hero-section');
    const rail = hero.locator('.hero-poster-rail');
    const thumbnails = hero.locator('.hero-poster-thumb');
    const content = hero.locator('.hero-content-zone');
    const overview = hero.locator('.hero-overview');

    await expect(thumbnails).toHaveCount(5);
    await expect(hero.locator('iframe')).toHaveCount(1);
    await expect(hero.locator('video')).toHaveCount(0);
    await expect(content).toHaveClass(/is-compact/, { timeout: 12_000 });

    await expect(overview).toBeVisible();
    await expect(overview).toHaveAttribute('aria-hidden', 'false');
    await expect(overview).toHaveCSS('-webkit-line-clamp', '2');
    await expect(hero.locator('.hero-genres')).toBeVisible();
    await expect(hero.locator('.hero-meta')).toBeVisible();
    await expect(hero.locator('.hero-action--primary')).toBeVisible();
    await expect(hero.locator('.hero-action--secondary')).toBeVisible();
    await expect(hero.locator('.hero-control')).toBeHidden();
    await expect(hero.locator('.hero-action--details')).toBeHidden();
    await expect(rail).not.toHaveClass(/is-hidden|is-compact/);
    await expect(rail).not.toHaveAttribute('aria-hidden', 'true');
    await expect(thumbnails.nth(1)).toBeVisible();

    const compactTiming = await page.evaluate(() => {
      const opened = window.__FAKE_YOUTUBE__.curtainStates.find((entry) => (
        entry.className.split(/\s+/).includes('is-open')
      ));
      const compacting = window.__FAKE_YOUTUBE__.contentStates.find((entry) => (
        entry.className.split(/\s+/).includes('is-compacting') && entry.at > opened.at
      ));
      const compact = window.__FAKE_YOUTUBE__.contentStates.find((entry) => (
        entry.className.split(/\s+/).includes('is-compact') && entry.at > compacting.at
      ));
      return {
        delay: compacting.at - opened.at,
        duration: compact.at - compacting.at,
        compactingClassName: compacting.className,
        animationDuration: compacting.animationDuration,
        animationName: compacting.animationName,
      };
    });
    expect(compactTiming.delay).toBeGreaterThanOrEqual(4_900);
    expect(compactTiming.delay).toBeLessThan(5_700);
    expect(compactTiming.duration).toBeGreaterThanOrEqual(650);
    expect(compactTiming.duration).toBeLessThan(950);
    expect(compactTiming.compactingClassName.split(/\s+/)).not.toContain('is-compact');
    expect(compactTiming.animationDuration).toBe('0.72s');
    expect(compactTiming.animationName).toContain('hero-content-compact-in');

    await content.hover();
    await expect(content).toHaveClass(/is-expanded/, { timeout: 1_500 });
    await expect(overview).toHaveAttribute('aria-hidden', 'false');
    await expect(overview).toHaveCSS('-webkit-line-clamp', '3');

    await thumbnails.nth(1).click();
    await expect(hero.locator('.hero-title')).toContainText('Second Feature');
    await expect(hero.locator('.hero-curtain-overlay')).toHaveClass(/is-closed/, { timeout: 3_000 });
    await expect(hero.locator('iframe')).toHaveCount(1);

    await page.waitForTimeout(1_300);
    await thumbnails.nth(0).click();
    await expect(hero.locator('.hero-title')).toContainText('Cinematic Curtain Hero');
    await expect(hero.locator('.hero-curtain-overlay')).toHaveClass(/is-closed/, { timeout: 3_000 });
    await expect(hero.locator('iframe')).toHaveCount(1, { timeout: 3_000 });

    const activePlayerAdvanced = await page.evaluate(async () => {
      const player = window.__FAKE_YOUTUBE__.players.at(-1);
      const firstTime = player.getCurrentTime();
      await new Promise((resolve) => setTimeout(resolve, 350));
      return player.getCurrentTime() > firstTime;
    });
    expect(activePlayerAdvanced).toBe(true);
  });

  test('keeps the poster and manual play CTA when playback never advances', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installYouTubePlayer(page, { stuck: true });
    await page.goto('/');

    const hero = page.locator('.hero-section');
    const curtain = hero.locator('.hero-curtain-overlay');
    const poster = hero.locator('.hero-poster-shell');

    await expect(curtain).toHaveClass(/is-closed/);
    await expect(hero.locator('.hero-youtube-video')).toHaveCSS('opacity', '0');
    await expect(hero.getByRole('button', { name: 'Play trailer', exact: true })).toBeVisible({ timeout: 7_000 });
    await expect(poster).toHaveClass(/is-visible/);
    await expect(curtain).toHaveCount(0);
  });
});
