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
      posterStates: [],
      players: [],
      startedAt,
    };
    window.__FAKE_YOUTUBE__ = diagnostics;

    let lastCurtainClass = '';
    let lastContentClass = '';
    let lastPosterSignature = '';
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

      const hero = document.querySelector('.hero-section');
      const poster = hero?.querySelector('.hero-poster-shell');
      const title = hero?.querySelector('.hero-title')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const buttonLabel = hero?.querySelector('.hero-action--secondary')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const posterVisible = poster?.classList.contains('is-visible') || false;
      const iframeCount = hero?.querySelectorAll('iframe').length || 0;
      const transitioning = Boolean(hero?.querySelector('.hero-transition-dip'));
      const posterSignature = `${title}|${buttonLabel}|${posterVisible}|${iframeCount}|${transitioning}`;
      if (hero && posterSignature !== lastPosterSignature) {
        lastPosterSignature = posterSignature;
        diagnostics.posterStates.push({
          at: Date.now() - startedAt,
          title,
          buttonLabel,
          posterVisible,
          iframeCount,
          transitioning,
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
        diagnostics.events.push({ kind: 'playing', player: this.instanceId, at: Date.now() - startedAt });
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
      pauseVideo() {
        if (this.playerState === 2) return;
        window.clearInterval(this.timerId);
        this.timerId = null;
        this.playerState = 2;
        diagnostics.events.push({ kind: 'paused', player: this.instanceId, at: Date.now() - startedAt });
        this.events.onStateChange?.({ data: 2, target: this });
      }
      endPlayback() {
        window.clearInterval(this.timerId);
        this.timerId = null;
        this.playerState = 0;
        diagnostics.events.push({ kind: 'ended', player: this.instanceId, at: Date.now() - startedAt });
        this.events.onStateChange?.({ data: 0, target: this });
      }
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

    await expect.poll(async () => page.evaluate(() => {
      const curtainElement = document.querySelector('.hero-curtain-overlay');
      const playerElement = document.querySelector('.hero-youtube-video');
      const posterElement = document.querySelector('.hero-poster-shell');
      return {
        curtainPreviewing: curtainElement?.classList.contains('is-previewing') ?? false,
        iframeCount: document.querySelectorAll('.hero-section iframe').length,
        nativeVideoCount: document.querySelectorAll('.hero-section video').length,
        playerVisible: playerElement?.classList.contains('is-visible') ?? false,
        playerOpacity: playerElement ? getComputedStyle(playerElement).opacity : null,
        posterVisible: posterElement?.classList.contains('is-visible') ?? false,
      };
    }), { timeout: 2_500 }).toEqual({
      curtainPreviewing: true,
      iframeCount: 1,
      nativeVideoCount: 0,
      playerVisible: false,
      playerOpacity: '0',
      posterVisible: true,
    });

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

    await expect(curtain).toHaveClass(/is-closing/, { timeout: 2_500 });
    await expect(curtain).toHaveClass(/is-opening/, { timeout: 5_500 });
    await expect(curtain).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(playerShell).toHaveClass(/is-visible/);
    await expect(playerShell).toHaveCSS('opacity', '1');
    await expect(curtain).toHaveClass(/(?:^|\s)is-open(?:\s|$)/, { timeout: 1_800 });
    await expect(curtain).toHaveCount(0, { timeout: 1_000 });

    await expect.poll(async () => page.evaluate(() => {
      const player = window.__FAKE_YOUTUBE__.players[0];
      return { muted: player.isMuted(), volume: player.volume };
    }), { timeout: 2_000 }).toEqual({ muted: false, volume: 60 });

    const revealTiming = await page.evaluate(() => {
      const previewingState = window.__FAKE_YOUTUBE__.curtainStates.find((entry) => (
        entry.className.split(/\s+/).includes('is-previewing')
      ));
      const closingState = window.__FAKE_YOUTUBE__.curtainStates.find((entry) => (
        entry.className.split(/\s+/).includes('is-closing')
      ));
      const closedState = window.__FAKE_YOUTUBE__.curtainStates.find((entry) => (
        entry.className.split(/\s+/).includes('is-closed')
      ));
      const openingState = window.__FAKE_YOUTUBE__.curtainStates.find((entry) => (
        entry.className.split(/\s+/).includes('is-opening')
      ));
      const openState = window.__FAKE_YOUTUBE__.curtainStates.find((entry) => (
        entry.className.split(/\s+/).includes('is-open')
      ));
      const unmuteEvent = window.__FAKE_YOUTUBE__.events.find((event) => event.kind === 'unmute');
      const fullVolumeEvent = window.__FAKE_YOUTUBE__.events.find((event) => (
        event.kind === 'volume' && event.value === 60 && event.at >= unmuteEvent.at
      ));
      const playingEvent = window.__FAKE_YOUTUBE__.events.find((event) => event.kind === 'playing');
      return {
        posterPreviewDuration: closingState.at - previewingState.at,
        closeDuration: closedState.at - closingState.at,
        closedHoldDuration: openingState.at - closedState.at,
        openDuration: openState.at - openingState.at,
        totalRevealDuration: openState.at - previewingState.at,
        closingAnimationDuration: closingState.animationDuration,
        openingAnimationDuration: openingState.animationDuration,
        playbackStartedDuringPosterPreview: playingEvent.at >= previewingState.at && playingEvent.at < closingState.at,
        audioDelay: unmuteEvent.at - openState.at,
        fadeDuration: fullVolumeEvent.at - unmuteEvent.at,
      };
    });
    expect(revealTiming.posterPreviewDuration).toBeGreaterThanOrEqual(1_850);
    expect(revealTiming.posterPreviewDuration).toBeLessThan(2_300);
    expect(revealTiming.closeDuration).toBeGreaterThanOrEqual(3_850);
    expect(revealTiming.closeDuration).toBeLessThan(4_400);
    expect(revealTiming.closedHoldDuration).toBeGreaterThanOrEqual(850);
    expect(revealTiming.closedHoldDuration).toBeLessThan(1_300);
    expect(revealTiming.openDuration).toBeGreaterThanOrEqual(900);
    expect(revealTiming.openDuration).toBeLessThan(1_350);
    expect(revealTiming.totalRevealDuration).toBeLessThan(8_500);
    expect(revealTiming.closingAnimationDuration).toBe('4s');
    expect(revealTiming.openingAnimationDuration).toBe('1s');
    expect(revealTiming.playbackStartedDuringPosterPreview).toBe(true);
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
    await expect(curtain).toHaveCount(0, { timeout: 5_000 });

    const curtainStates = await page.evaluate(() => window.__FAKE_YOUTUBE__.curtainStates);
    const previewingState = curtainStates.find((entry) => entry.className.split(/\s+/).includes('is-previewing'));
    const closingState = curtainStates.find((entry) => entry.className.split(/\s+/).includes('is-closing'));
    const openingState = curtainStates.find((entry) => entry.className.split(/\s+/).includes('is-opening'));
    const openState = curtainStates.find((entry) => entry.className.split(/\s+/).includes('is-open'));
    expect(previewingState).toBeTruthy();
    expect(closingState).toBeTruthy();
    expect(closingState.animationDuration).toBe('0.2s');
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
    await expect(curtain).toHaveClass(/is-previewing/);
    await expect(hero.locator('iframe')).toHaveCount(1);
    await expect(hero.locator('.hero-poster-shell')).toHaveClass(/is-visible/);
    await page.waitForTimeout(1_650);
    await expect(curtain).toHaveClass(/is-previewing/);

    const beforeOpening = await page.evaluate(() => ({
      muted: window.__FAKE_YOUTUBE__.players[0].isMuted(),
      unmuteCount: window.__FAKE_YOUTUBE__.events.filter((event) => event.kind === 'unmute').length,
    }));
    expect(beforeOpening).toEqual({ muted: true, unmuteCount: 0 });

    await expect(curtain).toHaveClass(/is-closing/, { timeout: 700 });
    await expect(curtain).toHaveCount(0, { timeout: 7_500 });
    const curtainStates = await page.evaluate(() => window.__FAKE_YOUTUBE__.curtainStates);
    expect(curtainStates.some((entry) => entry.className.split(/\s+/).includes('is-open'))).toBe(true);
    await expect.poll(async () => page.evaluate(() => {
      const player = window.__FAKE_YOUTUBE__.players[0];
      return { muted: player.isMuted(), volume: player.volume };
    }), { timeout: 5_000 }).toEqual({ muted: false, volume: 60 });
  });

  test('returns to poster immediately and keeps an absolute five-second carousel cadence', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installYouTubePlayer(page, { movies: HERO_MOVIES });
    await page.goto('/');

    const hero = page.locator('.hero-section');
    const trailerToggle = hero.locator('.hero-action--secondary');
    await expect(hero.locator('.hero-curtain-overlay')).toHaveCount(0, { timeout: 9_000 });
    await expect(trailerToggle).toContainText('Poster');

    await trailerToggle.evaluate((button) => {
      button.addEventListener('click', () => {
        window.__FAKE_YOUTUBE__.posterClickAt = Date.now() - window.__FAKE_YOUTUBE__.startedAt;
      }, { once: true });
    });
    await trailerToggle.click();
    const posterClickAt = await page.evaluate(() => window.__FAKE_YOUTUBE__.posterClickAt);

    await expect(trailerToggle).toContainText('Trailer');
    await expect(hero.locator('iframe')).toHaveCount(0);
    await expect(hero.locator('.hero-poster-shell')).toHaveClass(/is-visible/);
    await expect(hero.locator('.hero-poster-shell')).toHaveCSS('opacity', '1');
    await expect(hero.locator('.hero-title')).toContainText('Second Feature', { timeout: 6_500 });
    await expect(hero.locator('.hero-title')).toContainText('Third Feature', { timeout: 5_500 });
    await expect(trailerToggle).toContainText('Trailer');
    await expect(hero.locator('iframe')).toHaveCount(0);

    const timing = await page.evaluate((clickedAt) => {
      const states = window.__FAKE_YOUTUBE__.posterStates.filter((entry) => entry.at >= clickedAt);
      const posterReturned = states.find((entry) => (
        entry.buttonLabel === 'Trailer' && entry.posterVisible && entry.iframeCount === 0
      ));
      const firstTransition = states.find((entry) => entry.transitioning && entry.at > posterReturned.at);
      const firstSwap = states.find((entry) => entry.title === 'Second Feature');
      const secondTransition = states.find((entry) => entry.transitioning && entry.at > firstSwap.at);
      const secondSwap = states.find((entry) => entry.title === 'Third Feature');
      return {
        posterReturnLatency: posterReturned.at - clickedAt,
        firstTransitionDelay: firstTransition.at - posterReturned.at,
        firstSwapDelay: firstSwap.at - firstTransition.at,
        transitionCadence: secondTransition.at - firstTransition.at,
        secondSwapDelay: secondSwap.at - secondTransition.at,
      };
    }, posterClickAt);

    expect(timing.posterReturnLatency).toBeGreaterThanOrEqual(0);
    expect(timing.posterReturnLatency).toBeLessThan(350);
    expect(timing.firstTransitionDelay).toBeGreaterThanOrEqual(4_800);
    expect(timing.firstTransitionDelay).toBeLessThan(5_400);
    expect(timing.firstSwapDelay).toBeGreaterThanOrEqual(300);
    expect(timing.firstSwapDelay).toBeLessThan(700);
    expect(timing.transitionCadence).toBeGreaterThanOrEqual(4_750);
    expect(timing.transitionCadence).toBeLessThan(5_250);
    expect(timing.secondSwapDelay).toBeGreaterThanOrEqual(300);
    expect(timing.secondSwapDelay).toBeLessThan(700);
  });

  test('hides five thumbnails after three seconds and restores them with description gestures', async ({ page }) => {
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
    await expect(content).toHaveClass(/(?:^|\s)is-compact(?:\s|$)/, { timeout: 15_000 });

    await expect(overview).toBeVisible();
    await expect(overview).toHaveAttribute('aria-hidden', 'false');
    await expect(overview).toHaveCSS('-webkit-line-clamp', '2');
    await expect(hero.locator('.hero-genres')).toBeVisible();
    await expect(hero.locator('.hero-meta')).toBeVisible();
    await expect(hero.locator('.hero-action--primary')).toBeVisible();
    await expect(hero.locator('.hero-action--secondary')).toBeVisible();
    await expect(hero.locator('.hero-control')).toBeHidden();
    await expect(hero.locator('.hero-action--details')).toBeHidden();
    await expect(rail).toHaveClass(/is-hidden|is-compact/);
    await expect(rail).toHaveAttribute('aria-hidden', 'true');
    await expect(thumbnails.nth(1)).toBeHidden();

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
    expect(compactTiming.delay).toBeGreaterThanOrEqual(2_900);
    expect(compactTiming.delay).toBeLessThan(3_700);
    expect(compactTiming.duration).toBeGreaterThanOrEqual(650);
    expect(compactTiming.duration).toBeLessThan(950);
    expect(compactTiming.compactingClassName.split(/\s+/)).not.toContain('is-compact');
    expect(compactTiming.animationDuration).toBe('0.72s');
    expect(compactTiming.animationName).toContain('hero-content-compact-in');

    await content.hover();
    await expect(content).toHaveClass(/is-expanded/, { timeout: 1_500 });
    await expect(overview).toHaveAttribute('aria-hidden', 'false');
    await expect(overview).toHaveCSS('-webkit-line-clamp', '3');
    await expect(rail).not.toHaveClass(/is-hidden|is-compact/);
    await expect(rail).not.toHaveAttribute('aria-hidden', 'true');
    await expect(thumbnails.nth(1)).toBeVisible();

    await thumbnails.nth(1).click();
    await expect(hero.locator('.hero-title')).toContainText('Second Feature');
    await expect(hero.locator('.hero-curtain-overlay')).toHaveClass(/is-closing/, { timeout: 3_500 });
    await expect(hero.locator('iframe')).toHaveCount(1);

    await page.waitForTimeout(1_300);
    await thumbnails.nth(0).click();
    await expect(hero.locator('.hero-title')).toContainText('Cinematic Curtain Hero');
    await expect(hero.locator('.hero-curtain-overlay')).toHaveClass(/is-closing/, { timeout: 3_500 });
    await expect(hero.locator('iframe')).toHaveCount(1, { timeout: 3_000 });

    const activePlayerAdvanced = await page.evaluate(async () => {
      const player = window.__FAKE_YOUTUBE__.players.at(-1);
      const firstTime = player.getCurrentTime();
      await new Promise((resolve) => setTimeout(resolve, 350));
      return player.getCurrentTime() > firstTime;
    });
    expect(activePlayerAdvanced).toBe(true);
  });

  test('holds the ended poster for one second and uses a one-second prefetched continuation preview', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installYouTubePlayer(page, { movies: HERO_MOVIES });
    await page.goto('/');

    const hero = page.locator('.hero-section');
    const curtain = hero.locator('.hero-curtain-overlay');
    await expect(curtain).toHaveCount(0, { timeout: 9_000 });
    await expect(hero.locator('.hero-title')).toContainText('Cinematic Curtain Hero');

    const endedAt = await page.evaluate(() => {
      const at = Date.now() - window.__FAKE_YOUTUBE__.startedAt;
      window.__FAKE_YOUTUBE__.players[0].endPlayback();
      return at;
    });

    await expect(hero.locator('iframe')).toHaveCount(0);
    await expect(hero.locator('.hero-poster-shell')).toHaveClass(/is-visible/);
    await expect(hero.locator('.hero-title')).toContainText('Cinematic Curtain Hero');
    await expect(hero.locator('.hero-title')).toContainText('Second Feature', { timeout: 2_500 });
    await expect(hero.locator('iframe')).toHaveCount(1);
    await expect(curtain).toHaveClass(/is-previewing/);
    await expect(curtain).toHaveClass(/is-closing/, { timeout: 1_500 });

    const handoffTiming = await page.evaluate((endedTimestamp) => {
      const posterStates = window.__FAKE_YOUTUBE__.posterStates.filter((entry) => entry.at >= endedTimestamp);
      const transition = posterStates.find((entry) => entry.transitioning);
      const swap = posterStates.find((entry) => entry.title === 'Second Feature');
      const curtainStates = window.__FAKE_YOUTUBE__.curtainStates.filter((entry) => entry.at >= endedTimestamp);
      const previewing = curtainStates.find((entry) => entry.className.split(/\s+/).includes('is-previewing'));
      const closing = curtainStates.find((entry) => entry.className.split(/\s+/).includes('is-closing'));
      return {
        endedPosterHold: transition.at - endedTimestamp,
        posterSwapDelay: swap.at - transition.at,
        continuationPreview: closing.at - previewing.at,
      };
    }, endedAt);

    expect(handoffTiming.endedPosterHold).toBeGreaterThanOrEqual(850);
    expect(handoffTiming.endedPosterHold).toBeLessThan(1_300);
    expect(handoffTiming.posterSwapDelay).toBeGreaterThanOrEqual(300);
    expect(handoffTiming.posterSwapDelay).toBeLessThan(700);
    expect(handoffTiming.continuationPreview).toBeGreaterThanOrEqual(850);
    expect(handoffTiming.continuationPreview).toBeLessThan(1_300);
  });

  test('keeps the curtain closed when playback becomes paused after visual verification', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installYouTubePlayer(page);
    await page.goto('/');

    const hero = page.locator('.hero-section');
    const curtain = hero.locator('.hero-curtain-overlay');
    const playerShell = hero.locator('.hero-youtube-video');
    await expect(curtain).toHaveClass(/is-closed/, { timeout: 7_500 });

    await page.evaluate(() => window.__FAKE_YOUTUBE__.players[0].pauseVideo());
    await page.waitForTimeout(1_300);
    await expect(curtain).toHaveClass(/is-closed/);
    await expect(playerShell).toHaveCSS('opacity', '0');
    await expect(hero.locator('.hero-poster-shell')).toHaveClass(/is-visible/);

    await page.evaluate(() => window.__FAKE_YOUTUBE__.players[0].playVideo());
    await expect(curtain).toHaveClass(/is-opening/, { timeout: 2_000 });
    await expect(curtain).toHaveCount(0, { timeout: 2_000 });

    const resumedPlaybackAdvanced = await page.evaluate(async () => {
      const player = window.__FAKE_YOUTUBE__.players[0];
      const before = player.getCurrentTime();
      await new Promise((resolve) => setTimeout(resolve, 350));
      return player.getCurrentTime() > before;
    });
    expect(resumedPlaybackAdvanced).toBe(true);
  });

  test('keeps the poster and manual play CTA when playback never advances', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installYouTubePlayer(page, { stuck: true });
    await page.goto('/');

    const hero = page.locator('.hero-section');
    const curtain = hero.locator('.hero-curtain-overlay');
    const poster = hero.locator('.hero-poster-shell');

    await expect(curtain).toHaveCount(1);
    await expect(hero.locator('.hero-youtube-video')).toHaveCSS('opacity', '0');
    await expect(hero.getByRole('button', { name: 'Play trailer', exact: true })).toBeVisible({ timeout: 7_000 });
    await expect(poster).toHaveClass(/is-visible/);
    await expect(curtain).toHaveCount(0);

    const curtainStates = await page.evaluate(() => window.__FAKE_YOUTUBE__.curtainStates);
    expect(curtainStates.some((entry) => entry.className.split(/\s+/).includes('is-previewing'))).toBe(true);
    expect(curtainStates.some((entry) => entry.className.split(/\s+/).includes('is-closing'))).toBe(true);
    expect(curtainStates.some((entry) => (
      entry.className.split(/\s+/).includes('is-opening')
      || entry.className.split(/\s+/).includes('is-open')
    ))).toBe(false);
  });
});
