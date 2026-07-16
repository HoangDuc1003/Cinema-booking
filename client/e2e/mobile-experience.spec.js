import { expect, test } from '@playwright/test';
import path from 'node:path';

const poster = 'http://127.0.0.1:4174/src/assets/backgroundImage.png';
const movies = Array.from({ length: 12 }, (_, index) => ({
  _id: String(1000 + index),
  id: 1000 + index,
  title: index === 0 ? 'Nitro Night' : `Movie ${index + 1}`,
  overview: 'Một hành trình điện ảnh dành cho màn hình lớn và những khoảnh khắc đáng nhớ.',
  poster_path: poster,
  backdrop_path: poster,
  release_date: '2026-07-16',
  vote_average: 8.2,
  runtime: 112,
}));

const evidence = (name) => path.join('test-results', 'mobile-evidence', name);

const mockHomeApis = async (page) => {
  await page.route('**/api/show/**', async (route) => {
    const url = route.request().url();
    let body;
    if (url.includes('/api/show/hero')) {
      body = { success: true, settings: { mode: 'auto' }, movies: movies.slice(0, 5) };
    } else if (url.includes('/home-now-showing')) {
      body = { success: true, data: { results: movies } };
    } else if (url.includes('/popular')) {
      body = { success: true, data: { results: movies.slice().reverse() } };
    } else if (url.includes('/upcoming')) {
      body = { success: true, data: { results: movies.slice(4) } };
    } else if (url.includes('/trailers')) {
      body = { success: true, data: [] };
    } else if (url.endsWith('/api/show/all')) {
      body = { success: true, shows: movies };
    } else {
      body = { success: true, data: { results: [] } };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
};

const setProfileFixture = async (page, { signedIn = true } = {}) => {
  await page.addInitScript(({ signedIn: fixtureSignedIn }) => {
    window.__NITROCINE_PROFILE_TEST__ = {
      signedIn: fixtureSignedIn,
      userId: 'e2e-user',
      profiles: fixtureSignedIn ? [
        { id: 'profile-one', name: 'Hoàng', avatarId: 'nitro-red', isKids: false },
      ] : [],
    };
  }, { signedIn });
};

const openPicker = async (page, viewport = { width: 390, height: 844 }) => {
  await page.setViewportSize(viewport);
  await setProfileFixture(page);
  await mockHomeApis(page);
  await page.goto('/');
  await expect(page.getByTestId('profile-picker')).toBeVisible();
};

const enterHome = async (page, viewport = { width: 390, height: 844 }) => {
  await openPicker(page, viewport);
  await page.getByRole('button', { name: 'Chọn hồ sơ Hoàng' }).click();
  await expect(page.getByTestId('profile-launch')).toBeVisible();
  await expect(page.getByTestId('mobile-home')).toBeVisible({ timeout: 4_000 });
};

test.describe('mobile application experience', () => {
  test('signed-out phone renders entry without desktop navigation or overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setProfileFixture(page, { signedIn: false });
    await page.goto('/');
    await expect(page.getByTestId('mobile-auth-entry')).toBeVisible();
    await expect.poll(() => page.locator('.mobile-auth-entry__backdrop').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
    await expect(page.locator('.app-navbar')).toHaveCount(0);
    await expect(page.locator('footer')).toHaveCount(0);
    await expect(page.getByTestId('mobile-bottom-nav')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: evidence('01-signed-out-390x844.png'), fullPage: true });
  });

  test('profile picker is keyboard accessible and launch is data driven', async ({ page }) => {
    await openPicker(page);
    await expect(page.getByRole('heading', { name: 'Chọn hồ sơ của bạn' })).toBeVisible();
    const profile = page.getByRole('button', { name: 'Chọn hồ sơ Hoàng' });
    await profile.focus();
    await expect(profile).toBeFocused();
    await page.screenshot({ path: evidence('02-profile-picker-390x844.png'), fullPage: true });
    await profile.press('Enter');
    await expect(page.getByRole('status')).toContainText('Đang tải trang chủ');
    await page.screenshot({ path: evidence('03-profile-launch-390x844.png'), fullPage: true });
    await expect(page.getByTestId('mobile-home')).toBeVisible({ timeout: 4_000 });
    expect(await page.evaluate(() => sessionStorage.getItem('nitrocine:active-profile:e2e-user'))).toBe('profile-one');
  });

  test('profile editor supports rename, allowed avatar selection, add and permitted delete', async ({ page }) => {
    await openPicker(page);
    await page.getByRole('button', { name: 'Quản lý hồ sơ' }).click();
    await page.getByRole('button', { name: 'Chỉnh sửa hồ sơ Hoàng' }).click();
    const name = page.getByLabel('Tên hồ sơ');
    await expect(name).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Lưu hồ sơ' })).toBeFocused();
    await name.fill('Hoàng mới');
    await page.getByRole('button', { name: 'Chọn ảnh nitro-blue' }).click();
    await page.getByRole('button', { name: 'Lưu hồ sơ' }).click();
    await expect(page.getByText('Hoàng mới', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Thêm hồ sơ' }).click();
    await page.getByLabel('Tên hồ sơ').fill('Gia đình');
    await page.getByRole('button', { name: 'Lưu hồ sơ' }).click();
    await expect(page.getByText('Gia đình', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Chỉnh sửa hồ sơ Gia đình' }).click();
    await page.getByRole('button', { name: 'Xóa' }).click();
    await expect(page.getByText('Gia đình', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Chỉnh sửa hồ sơ Hoàng mới' }).click();
    await expect(page.getByRole('button', { name: 'Xóa' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Chỉnh sửa hồ sơ Hoàng mới' })).toBeFocused();
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
    test(`mobile Home has app shell at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      const requests = [];
      const failedAppRequests = [];
      const pageErrors = [];
      page.on('request', (request) => requests.push(request.url()));
      page.on('requestfailed', (request) => {
        if (/\/api\/show\/|\/src\/assets\//.test(request.url())) failedAppRequests.push(request.url());
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await enterHome(page, viewport);
      await expect(page.getByTestId('mobile-top-bar')).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Danh mục phim' })).toBeVisible();
      await expect(page.getByTestId('mobile-featured-card')).toBeVisible();
      await expect(page.getByTestId('mobile-movie-rail').first()).toBeVisible();
      await expect(page.getByTestId('mobile-bottom-nav')).toBeVisible();
      await expect(page.locator('.app-navbar')).toHaveCount(0);
      await expect(page.locator('footer')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect.poll(() => requests.filter((url) => url.includes('/api/show/tmdb/upcoming')).length).toBe(1);
      expect(requests.filter((url) => url.includes('/api/show/hero')).length).toBe(1);
      expect(requests.filter((url) => url.includes('/home-now-showing')).length).toBe(1);
      expect(requests.filter((url) => url.includes('/api/show/tmdb/popular')).length).toBe(1);
      expect(requests.filter((url) => url.endsWith('/api/show/all')).length).toBe(0);
      expect(requests.some((url) => /youtube|\/videos(?:\?|$)/i.test(url))).toBe(false);
      expect(failedAppRequests).toEqual([]);
      expect(pageErrors).toEqual([]);
      await expect(page.locator('iframe, video')).toHaveCount(0);
      await page.screenshot({ path: evidence(`04-home-${viewport.width}x${viewport.height}.png`), fullPage: true });
    });
  }

  test('bottom navigation exposes real routes and profile switching', async ({ page }) => {
    await enterHome(page);
    const home = page.getByRole('button', { name: 'Trang chủ', exact: true });
    await expect(home).toHaveAttribute('aria-current', 'page');
    const bottomNav = page.getByTestId('mobile-bottom-nav');
    await bottomNav.getByRole('button', { name: 'Tìm kiếm' }).click();
    await expect(page).toHaveURL(/\/movies$/);
    await bottomNav.getByRole('button', { name: 'Vé của tôi' }).click();
    await expect(page).toHaveURL(/\/my-bookings$/);
    await bottomNav.getByRole('button', { name: 'Hồ sơ' }).click();
    await expect(page.getByTestId('profile-picker')).toBeVisible();
  });

  test('reduced motion replaces the rotating launch ring', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPicker(page);
    await page.getByRole('button', { name: 'Chọn hồ sơ Hoàng' }).click();
    const ring = page.locator('.mobile-launch-ring');
    await expect(ring).toBeVisible();
    expect(await ring.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  });
});

test('desktop Home remains on the original Navbar, Hero and Footer tree', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockHomeApis(page);
  await page.goto('/');
  await expect(page.locator('.app-navbar')).toBeVisible();
  await expect(page.locator('.hero-section')).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
  await expect(page.getByTestId('mobile-top-bar')).toHaveCount(0);
  await expect(page.getByTestId('mobile-bottom-nav')).toHaveCount(0);
  await page.screenshot({ path: evidence('05-desktop-home-1440x900.png'), fullPage: true });
});
