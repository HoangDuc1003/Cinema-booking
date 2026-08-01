import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(HERE, '../../artifacts/hero-live');
const BASE_URL = process.env.HERO_LIVE_BASE_URL || 'http://127.0.0.1:4174';
const HEADLESS = process.env.HERO_LIVE_HEADLESS === '1';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const fixtureUrl = () => {
  const url = new URL(BASE_URL);
  url.searchParams.set('heroMock', '1');
  return url.toString();
};

const waitForAdvancingPlayback = async (page, video) => {
  await page.waitForFunction(() => {
    const element = document.querySelector('.hero-section video');
    return Boolean(
      element
      && element.readyState >= 2
      && element.videoWidth > 0
      && element.videoHeight > 0
      && !element.paused
      && !element.error
      && element.currentTime > 0.35
    );
  }, undefined, { timeout: 20_000 });

  const sampleA = await video.evaluate((element) => element.currentTime);
  await page.waitForTimeout(800);
  const sampleB = await video.evaluate((element) => element.currentTime);
  assert(sampleB > sampleA + 0.15, 'Hero currentTime did not advance.');
  return { sampleA, sampleB };
};

const verifyViewport = async (browser, {
  name,
  viewport,
  isMobile = false,
}) => {
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch: isMobile,
    locale: 'en-US',
    storageState: undefined,
  });
  const page = await context.newPage();
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.goto(fixtureUrl(), { waitUntil: 'domcontentloaded' });
  const hero = page.locator('.hero-section');
  await hero.locator('.hero-title').waitFor({ state: 'visible', timeout: 20_000 });
  const video = hero.locator('video');
  await video.waitFor({ state: 'attached', timeout: 20_000 });
  const playback = await waitForAdvancingPlayback(page, video);
  await hero.screenshot({ path: path.join(OUTPUT_DIR, `hero-${name}-playing.png`) });

  const contract = await video.evaluate((element) => ({
    autoPlay: element.autoplay,
    playsInline: element.playsInline,
    controls: element.controls,
    controlsAttribute: element.hasAttribute('controls'),
    preload: element.preload,
    disablePictureInPicture: element.disablePictureInPicture,
    disableRemotePlayback: element.disableRemotePlayback,
    controlsList: element.getAttribute('controlslist'),
    pointerEvents: getComputedStyle(element).pointerEvents,
    videoWidth: element.videoWidth,
    videoHeight: element.videoHeight,
    currentSrc: element.currentSrc,
    muted: element.muted,
    volume: element.volume,
  }));
  const title = (await hero.locator('.hero-title').innerText()).replace(/\s+/g, ' ').trim();
  const videoRequestUrls = [...new Set(requests.filter((url) => /\/mock\/hero-trailer\.mp4/.test(url)))];
  const nativeMediaRequestUrls = [...new Set(requests.filter((url) => /\.(?:mp4|webm)(?:[?#]|$)/i.test(url)))];
  const heroApiRequestUrls = requests.filter((url) => /\/api\/show\/hero(?:\?|$)/.test(url));
  const forbiddenHeroRequests = requests.filter((url) => (
    /\/tmdb\/movie\/[^/]+\/videos(?:\?|$)/i.test(url)
    || /^https?:\/\/(?:[^/]+\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)\//i.test(url)
  ));

  assert(await hero.locator('video').count() === 1, 'Hero must mount exactly one native video.');
  assert(await hero.locator('iframe').count() === 0, 'Hero contains an iframe.');
  assert(await hero.getByRole('button', { name: /pause/i }).count() === 0, 'Hero exposes a pause button.');
  assert(contract.autoPlay && contract.playsInline, 'Native autoplay/playsInline contract is missing.');
  assert(!contract.controls && !contract.controlsAttribute, 'Native controls are enabled.');
  assert(contract.preload === 'metadata', `Expected preload=metadata, received ${contract.preload}.`);
  assert(contract.videoWidth > 0 && contract.videoHeight > 0, 'Decoded video dimensions are invalid.');
  assert(contract.pointerEvents === 'none', 'Video accepts pointer events.');
  assert(heroApiRequestUrls.length === 1, `Expected one Hero API request, received ${heroApiRequestUrls.length}.`);
  assert(videoRequestUrls.length <= 1, `Expected at most one initial video URL, received ${videoRequestUrls.length}.`);
  assert(nativeMediaRequestUrls.length <= 1, `Expected at most one initial native media URL, received ${nativeMediaRequestUrls.length}.`);
  assert(forbiddenHeroRequests.length === 0, 'Hero made a forbidden YouTube/TMDB-video request.');

  await context.close();
  return {
    title,
    playback,
    contract,
    heroApiRequestCount: heroApiRequestUrls.length,
    uniqueInitialVideoRequestCount: videoRequestUrls.length,
    uniqueInitialNativeMediaRequestCount: nativeMediaRequestUrls.length,
    forbiddenHeroRequests,
  };
};

await mkdir(OUTPUT_DIR, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: HEADLESS,
});

try {
  const desktop = await verifyViewport(browser, {
    name: 'desktop',
    viewport: { width: 1440, height: 900 },
  });
  const mobile = await verifyViewport(browser, {
    name: 'mobile',
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const evidence = {
    capturedAt: new Date().toISOString(),
    browser: `Google Chrome (${HEADLESS ? 'headless' : 'headed'})`,
    context: 'fresh storage context using the explicit development-only native MP4 fixture',
    desktop,
    mobile,
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
