const DEFAULT_TRAILER_TITLE = 'Movie Trailer';
const DEFAULT_VIDEO_NAME = 'Mock Trailer';
const NATIVE_VIDEO_MIME_TYPES = Object.freeze({
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
});

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

const isIframeVideoUrl = (source) => {
  try {
    const url = new URL(source, 'https://hero-mock.local');
    const hostname = url.hostname.toLowerCase();
    const isKnownIframeHost = hostname === 'youtu.be'
      || hostname.endsWith('.youtu.be')
      || hostname === 'youtube.com'
      || hostname.endsWith('.youtube.com')
      || hostname === 'youtube-nocookie.com'
      || hostname.endsWith('.youtube-nocookie.com')
      || hostname === 'player.vimeo.com';
    const hasEmbedPath = /\/(?:embed|iframe)(?:\/|$)/i.test(url.pathname);

    return isKnownIframeHost || hasEmbedPath;
  } catch {
    return true;
  }
};

const inferNativeMimeType = (source) => {
  const match = String(source).match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
  return match ? NATIVE_VIDEO_MIME_TYPES[match[1].toLowerCase()] || '' : '';
};

export const resolveNativeHeroVideoSource = (trailer) => {
  if (!trailer || typeof trailer !== 'object' || trailer.embedUrl) return null;

  const src = typeof trailer.videoUrl === 'string'
    ? trailer.videoUrl.trim()
    : typeof trailer.src === 'string'
      ? trailer.src.trim()
      : '';
  if (!src || isIframeVideoUrl(src)) return null;

  const explicitType = typeof trailer.mimeType === 'string'
    ? trailer.mimeType.trim()
    : typeof trailer.type === 'string'
      ? trailer.type.trim()
      : '';
  const inferredType = inferNativeMimeType(src);
  const hasVideoMime = /^video\/[a-z0-9][a-z0-9.+-]*(?:\s*;.*)?$/i.test(explicitType);

  if (!inferredType && !hasVideoMime) return null;

  return {
    src,
    type: hasVideoMime ? explicitType : inferredType,
  };
};

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
    mimeType: fixture.mimeType || fixture.type || inferNativeMimeType(videoUrl),
    thumbnail,
    videoName: fixture.videoName || DEFAULT_VIDEO_NAME,
    qualityLabel: fixture.qualityLabel || '1080p',
    isRequestedTrailer: true,
  }];
};
