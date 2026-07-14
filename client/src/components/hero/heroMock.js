import { inferNativeVideoMimeType } from './heroVideoSource.js';

const DEFAULT_TRAILER_TITLE = 'Movie Trailer';
const DEFAULT_VIDEO_NAME = 'Mock Trailer';

export {
  canUseHeroBackgroundVideo,
  resolveConfiguredHeroVideoSource,
  resolveHeroVideoSource,
  resolveNativeHeroVideoSource,
  resolveYouTubeHeroVideoSource,
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

const hashMovieKey = (movieKey) => {
  const value = String(movieKey ?? '');
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

export const isHeroTrailerMockEnabled = (search, isDev) => (
  Boolean(isDev) && getSearchParams(search).get('heroMock') === '1'
);

export const resolveHeroMockTrailers = ({ movieKey, movie, fixtures } = {}) => {
  if (!Array.isArray(fixtures) || fixtures.length === 0) return [];

  const resolvedMovieKey = String(movieKey ?? movie?.id ?? movie?._id ?? '');
  const fixtureIndex = hashMovieKey(resolvedMovieKey) % fixtures.length;
  const fixture = fixtures[fixtureIndex];

  if (!fixture || typeof fixture !== 'object') return [];

  const videoUrl = fixture.videoUrl || fixture.embedUrl || '';
  const thumbnail = fixture.thumbnail || fixture.image || '';

  return [{
    id: fixture.id || `hero-mock-${resolvedMovieKey || 'movie'}-${fixtureIndex}`,
    title: fixture.title || movie?.title || movie?.name || DEFAULT_TRAILER_TITLE,
    release_date: fixture.release_date || movie?.release_date || '',
    vote_average: fixture.vote_average ?? movie?.vote_average,
    videoUrl,
    mimeType: fixture.mimeType || fixture.type || inferNativeVideoMimeType(videoUrl),
    thumbnail,
    videoName: fixture.videoName || DEFAULT_VIDEO_NAME,
    qualityLabel: fixture.qualityLabel || '1080p',
    isRequestedTrailer: true,
  }];
};
