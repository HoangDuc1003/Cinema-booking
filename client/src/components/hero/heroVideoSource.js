const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export const NATIVE_VIDEO_MIME_TYPES = Object.freeze({
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  ogv: 'video/ogg',
});

const isHostOrSubdomain = (hostname, domain) => (
  hostname === domain || hostname.endsWith(`.${domain}`)
);

const isYouTubeHostname = (hostname) => (
  isHostOrSubdomain(hostname, 'youtube.com')
  || isHostOrSubdomain(hostname, 'youtube-nocookie.com')
  || isHostOrSubdomain(hostname, 'youtu.be')
);

const parseHttpUrl = (value) => {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
};

const normalizeYouTubeVideoId = (value) => {
  const candidate = String(value || '').trim();
  return YOUTUBE_VIDEO_ID_PATTERN.test(candidate) ? candidate : '';
};

const decodePathSegment = (segment) => {
  try {
    return decodeURIComponent(segment || '');
  } catch {
    return '';
  }
};

export const extractYouTubeVideoId = (value) => {
  const directId = normalizeYouTubeVideoId(value);
  if (directId) return directId;

  if (typeof value !== 'string') return null;
  const url = parseHttpUrl(value.trim());
  if (!url || !isYouTubeHostname(url.hostname.toLowerCase())) return null;

  const hostname = url.hostname.toLowerCase();
  const pathSegments = url.pathname.split('/').filter(Boolean);
  let candidate = '';

  if (isHostOrSubdomain(hostname, 'youtu.be')) {
    candidate = decodePathSegment(pathSegments[0]);
  } else {
    const route = String(pathSegments[0] || '').toLowerCase();
    if (route === 'watch') candidate = url.searchParams.get('v') || '';
    if (['embed', 'shorts', 'live'].includes(route)) {
      candidate = decodePathSegment(pathSegments[1]);
    }
  }

  return normalizeYouTubeVideoId(candidate) || null;
};

export const inferNativeVideoMimeType = (source) => {
  const match = String(source || '').match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
  return match ? NATIVE_VIDEO_MIME_TYPES[match[1].toLowerCase()] || '' : '';
};

const getExplicitVideoMimeType = (candidate) => {
  const value = typeof candidate === 'string' ? candidate.trim() : '';
  return /^video\/[a-z0-9][a-z0-9.+-]*(?:\s*;.*)?$/i.test(value) ? value : '';
};

const isIframeVideoUrl = (source) => {
  const url = parseHttpUrl(source);
  if (!url) return false;

  const hostname = url.hostname.toLowerCase();
  return isYouTubeHostname(hostname)
    || hostname === 'player.vimeo.com'
    || /\/(?:embed|iframe)(?:\/|$)/i.test(url.pathname);
};

export const resolveNativeHeroVideoSource = (trailer) => {
  if (!trailer || typeof trailer !== 'object' || trailer.embedUrl) return null;

  const src = typeof trailer.videoUrl === 'string'
    ? trailer.videoUrl.trim()
    : typeof trailer.src === 'string'
      ? trailer.src.trim()
      : '';
  if (!src || isIframeVideoUrl(src)) return null;

  const explicitMimeType = getExplicitVideoMimeType(trailer.mimeType)
    || getExplicitVideoMimeType(trailer.type);
  const mimeType = explicitMimeType || inferNativeVideoMimeType(src);
  if (!mimeType) return null;

  return { kind: 'native', src, mimeType };
};

export const resolveYouTubeHeroVideoSource = (trailer) => {
  if (!trailer || typeof trailer !== 'object') return null;

  const candidates = [trailer.videoId, trailer.embedUrl, trailer.videoUrl, trailer.src];
  for (const candidate of candidates) {
    const videoId = extractYouTubeVideoId(candidate);
    if (videoId) return { kind: 'youtube', videoId };
  }
  return null;
};

export const resolveHeroVideoSource = (trailer) => (
  resolveNativeHeroVideoSource(trailer) || resolveYouTubeHeroVideoSource(trailer)
);

export const resolveConfiguredHeroVideoSource = (movie) => {
  if (!movie || typeof movie !== 'object') return null;

  const src = typeof movie.heroVideoUrl === 'string'
    ? movie.heroVideoUrl.trim()
    : typeof movie.background_video_url === 'string'
      ? movie.background_video_url.trim()
      : '';
  if (!src || isIframeVideoUrl(src)) return null;

  if (movie.heroVideoStatus !== undefined && movie.heroVideoStatus !== 'ready') {
    return null;
  }

  const explicitMimeType = getExplicitVideoMimeType(movie.heroVideoMimeType)
    || getExplicitVideoMimeType(movie.background_video_mime_type);
  const mimeType = explicitMimeType || inferNativeVideoMimeType(src);
  if (!mimeType) return null;

  return {
    kind: 'native',
    src,
    mimeType,
  };
};


export const canUseHeroBackgroundVideo = (movie, { mockEnabled = false } = {}) => (
  Boolean(mockEnabled) || Boolean(resolveConfiguredHeroVideoSource(movie))
);

/**
 * Returns true when the movie can potentially resolve a Hero trailer, either
 * because it already has a configured native source or because mock is enabled.
 */
export const canUseNativeHeroVideo = (movie, { mockEnabled = false } = {}) => {
  if (!movie || typeof movie !== 'object') return false;
  if (mockEnabled) return true;
  return Boolean(resolveConfiguredHeroVideoSource(movie));
};

