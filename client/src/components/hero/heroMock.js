const DEFAULT_VIDEO_NAME = 'Mock Trailer';

export {
  canUseNativeHeroVideo,
  canUseHeroBackgroundVideo,
  resolveConfiguredHeroVideoSource,
} from './heroVideoSource.js';

export const HERO_NATIVE_MOCK_FIXTURE = Object.freeze({
  id: 'hero-native-mock',
  videoUrl: '/mock/hero-trailer.mp4',
  mimeType: 'video/mp4',
  videoName: DEFAULT_VIDEO_NAME,
  qualityLabel: '1080p',
  isRequestedTrailer: true,
});

export const HERO_NATIVE_MOCK_FIXTURES = Object.freeze([HERO_NATIVE_MOCK_FIXTURE]);

const getSearchParams = (search) => {
  if (search instanceof URLSearchParams) return search;
  return new URLSearchParams(typeof search === 'string' ? search : '');
};

export const isHeroTrailerMockEnabled = (search, isDev) => (
  Boolean(isDev) && getSearchParams(search).get('heroMock') === '1'
);
