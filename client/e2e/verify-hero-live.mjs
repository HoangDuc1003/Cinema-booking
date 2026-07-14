import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(HERE, '../../artifacts/hero-live');
const BASE_URL = process.env.HERO_LIVE_BASE_URL || 'http://127.0.0.1:4174';
const HEADLESS = process.env.HERO_LIVE_HEADLESS === '1';
const PLAYING = 1;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const waitForSettledHero = async (page) => {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('.hero-section .hero-title').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(750);
};

const waitForHeroPlaying = async (page) => {
  await page.waitForFunction(() => {
    const snapshot = window.__NITROCINE_HERO_MEDIA_DIAGNOSTICS__?.getSnapshot?.();
    const playingState = window.YT?.PlayerState?.PLAYING;
    return Boolean(snapshot && playingState != null && snapshot.playerState === playingState && snapshot.currentTime > 0.1);
  }, undefined, { timeout: 30_000 });
  await page.locator('.hero-youtube-video.is-visible').waitFor({ state: 'visible', timeout: 5_000 });
};

const getHeroSnapshot = (page) => page.evaluate(() => (
  window.__NITROCINE_HERO_MEDIA_DIAGNOSTICS__?.getSnapshot?.() || null
));

const verifyDesktopAndTrailerSection = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    storageState: undefined,
  });
  const page = await context.newPage();
  const metadataRequests = [];
  page.on('request', (request) => {
    if (/\/api\/show\/tmdb\/movie\/\d+\/videos(?:\?|$)/.test(request.url())) {
      metadataRequests.push(request.url());
    }
  });

  await waitForSettledHero(page);
  const hero = page.locator('.hero-section');
  const title = (await hero.locator('.hero-title').innerText()).replace(/\s+/g, ' ').trim();
  const trailerButton = hero.getByRole('button', { name: 'Trailer', exact: true });
  await trailerButton.waitFor({ state: 'visible' });

  const scrollBefore = await page.evaluate(() => window.scrollY);
  let clickCount = 0;
  await trailerButton.click();
  clickCount += 1;
  const scrollImmediatelyAfterClick = await page.evaluate(() => window.scrollY);
  const preStable = await page.evaluate(() => ({
    posterVisible: document.querySelector('.hero-poster-shell')?.classList.contains('is-visible') || false,
    videoVisible: document.querySelector('.hero-youtube-video')?.classList.contains('is-visible') || false,
  }));

  await waitForHeroPlaying(page);
  const sampleA = await getHeroSnapshot(page);
  await page.waitForTimeout(2_500);
  const sampleB = await getHeroSnapshot(page);

  assert(sampleA?.playerState === PLAYING, 'Hero did not reach YouTube PLAYING.');
  assert(sampleB?.currentTime > sampleA?.currentTime, 'Hero currentTime did not advance.');
  assert(clickCount === 1, 'Hero CTA click count was not exactly one.');
  assert(metadataRequests.length === 1, `Expected one metadata request, received ${metadataRequests.length}.`);
  const scrollAfterPlayback = await page.evaluate(() => window.scrollY);
  assert(
    scrollImmediatelyAfterClick === scrollBefore,
    `Hero CTA changed scroll immediately (${scrollBefore} -> ${scrollImmediatelyAfterClick}).`,
  );
  assert(
    scrollAfterPlayback === scrollBefore,
    `Hero playback changed scroll position (${scrollBefore} -> ${scrollAfterPlayback}).`,
  );

  await page.waitForTimeout(2_500);
  await hero.screenshot({ path: path.join(OUTPUT_DIR, 'hero-caption-05s.png') });
  await page.waitForTimeout(5_000);
  await hero.screenshot({ path: path.join(OUTPUT_DIR, 'hero-desktop-playing.png') });
  await page.waitForTimeout(250);
  await hero.screenshot({ path: path.join(OUTPUT_DIR, 'hero-caption-10s.png') });

  const heroVideoId = await hero.locator('.hero-youtube-video').getAttribute('data-video-id');
  const heroPlayerCount = await hero.locator('.hero-youtube-video iframe').count();
  const centerButtonCount = await page.locator('.cinematic-center-btn').count()
    + await hero.getByRole('button', { name: /^(Play|Pause)$/ }).count();
  const heroInternalButtonCount = await hero.locator('.hero-youtube-video button').count();
  const iframePointerEvents = await hero.locator('.hero-youtube-video iframe').evaluate(
    (iframe) => getComputedStyle(iframe).pointerEvents,
  );
  const endpoint = metadataRequests[0];
  const movieId = endpoint?.match(/\/movie\/(\d+)\/videos/)?.[1] || '';
  const heroMetadataRequestCount = metadataRequests.length;

  await hero.getByRole('button', { name: 'Poster', exact: true }).click();

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const trailerCard = page.locator('.cinematic-player-card').first();
  await trailerCard.scrollIntoViewIfNeeded();
  await trailerCard.locator('iframe').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => {
    const snapshot = window.__NITROCINE_TRAILER_PLAYER_DIAGNOSTICS__?.getSnapshot?.();
    const playingState = window.YT?.PlayerState?.PLAYING;
    return Boolean(snapshot && playingState != null && snapshot.playerState === playingState && snapshot.currentTime > 0.1);
  }, undefined, { timeout: 30_000 });
  const trailerSampleA = await page.evaluate(() => (
    window.__NITROCINE_TRAILER_PLAYER_DIAGNOSTICS__?.getSnapshot?.() || null
  ));
  await page.waitForTimeout(5_000);
  await trailerCard.screenshot({ path: path.join(OUTPUT_DIR, 'trailer-section-caption-05s.png') });
  await page.waitForTimeout(5_000);
  const trailerSampleB = await page.evaluate(() => (
    window.__NITROCINE_TRAILER_PLAYER_DIAGNOSTICS__?.getSnapshot?.() || null
  ));
  await trailerCard.screenshot({ path: path.join(OUTPUT_DIR, 'trailer-section-playing.png') });
  await page.waitForTimeout(250);
  await trailerCard.screenshot({ path: path.join(OUTPUT_DIR, 'trailer-section-caption-10s.png') });

  assert(trailerSampleB?.currentTime > trailerSampleA?.currentTime, 'TrailerSection currentTime did not advance.');
  assert(await page.locator('.cinematic-center-btn').count() === 0, 'TrailerSection center control is present.');

  await context.close();
  return {
    title,
    movieId,
    videoId: heroVideoId,
    endpoint,
    singleCtaClickCount: clickCount,
    metadataRequestCount: heroMetadataRequestCount,
    youtubePlayerCount: heroPlayerCount,
    playbackState: sampleB.playerState,
    currentTimeSampleA: sampleA.currentTime,
    currentTimeSampleB: sampleB.currentTime,
    centerPlayPauseButtonCount: centerButtonCount,
    heroInternalButtonCount,
    iframePointerEvents,
    preStable,
    trailerSection: {
      videoId: trailerSampleB.videoId,
      playbackState: trailerSampleB.playerState,
      currentTimeSampleA: trailerSampleA.currentTime,
      currentTimeSampleB: trailerSampleB.currentTime,
      centerPlayPauseButtonCount: 0,
    },
  };
};

const verifyMobile = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'en-US',
    storageState: undefined,
  });
  const page = await context.newPage();
  await waitForSettledHero(page);
  await page.locator('.hero-section').getByRole('button', { name: 'Trailer', exact: true }).click();
  await waitForHeroPlaying(page);
  await page.waitForTimeout(1_000);
  const snapshot = await getHeroSnapshot(page);
  await page.locator('.hero-section').screenshot({ path: path.join(OUTPUT_DIR, 'hero-mobile-playing.png') });
  await context.close();
  return snapshot;
};

await mkdir(OUTPUT_DIR, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: HEADLESS,
});

try {
  const hero = await verifyDesktopAndTrailerSection(browser);
  const mobile = await verifyMobile(browser);
  const evidence = {
    capturedAt: new Date().toISOString(),
    browser: `Google Chrome (${HEADLESS ? 'headless' : 'headed'})`,
    context: 'fresh contexts without cookies, localStorage, storageState, or YouTube account',
    hero,
    mobile,
    visualReview: {
      heroCaptionVisible: 'pending screenshot review',
      trailerSectionCaptionVisible: 'pending screenshot review',
      youtubeCenterOverlayVisible: 'pending screenshot review',
    },
  };
  await writeFile(
    path.join(OUTPUT_DIR, 'raw-evidence.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
    'utf8',
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
