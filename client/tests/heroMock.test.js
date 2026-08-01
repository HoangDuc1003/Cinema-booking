import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HERO_NATIVE_MOCK_FIXTURE,
  HERO_NATIVE_MOCK_FIXTURES,
  canUseHeroBackgroundVideo,
  isHeroTrailerMockEnabled,
  resolveConfiguredHeroVideoSource,
} from '../src/components/hero/heroMock.js';

test('Hero trailer mock requires both development mode and the explicit URL flag', () => {
  assert.equal(isHeroTrailerMockEnabled('?heroMock=1', true), true);
  assert.equal(isHeroTrailerMockEnabled('?view=home&heroMock=1', true), true);
  assert.equal(isHeroTrailerMockEnabled('?heroMock=0', true), false);
  assert.equal(isHeroTrailerMockEnabled('', true), false);
  assert.equal(isHeroTrailerMockEnabled('?heroMock=1', false), false);
});

test('the one development fixture is a frozen native MP4 and not a production fallback', () => {
  assert.equal(HERO_NATIVE_MOCK_FIXTURE.videoUrl, '/mock/hero-trailer.mp4');
  assert.equal(HERO_NATIVE_MOCK_FIXTURE.mimeType, 'video/mp4');
  assert.deepEqual(HERO_NATIVE_MOCK_FIXTURES, [HERO_NATIVE_MOCK_FIXTURE]);
  assert.equal(Object.isFrozen(HERO_NATIVE_MOCK_FIXTURE), true);
  assert.equal(Object.isFrozen(HERO_NATIVE_MOCK_FIXTURES), true);

  const configured = {
    heroVideoStatus: 'ready',
    heroVideoMimeType: 'video/mp4',
    heroVideoUrl: HERO_NATIVE_MOCK_FIXTURE.videoUrl,
  };
  assert.equal(canUseHeroBackgroundVideo(configured), false);
  assert.ok(resolveConfiguredHeroVideoSource(configured, {
    mockEnabled: true,
    isProduction: false,
  }));
});
