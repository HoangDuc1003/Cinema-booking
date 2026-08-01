export const NATIVE_VIDEO_MIME_TYPES = Object.freeze({
  mp4: 'video/mp4',
  webm: 'video/webm',
});

export const HERO_NATIVE_VIDEO_MIME_TYPES = Object.freeze(
  Object.values(NATIVE_VIDEO_MIME_TYPES),
);

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

export const inferNativeVideoMimeType = (source) => {
  const match = String(source || '').match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
  return match ? NATIVE_VIDEO_MIME_TYPES[match[1].toLowerCase()] || '' : '';
};

const getExplicitVideoMimeType = (candidate) => {
  const value = typeof candidate === 'string' ? candidate.trim() : '';
  const normalized = value.split(';', 1)[0].trim().toLowerCase();
  return HERO_NATIVE_VIDEO_MIME_TYPES.includes(normalized) ? normalized : '';
};

const isIframeVideoUrl = (source) => {
  const url = parseHttpUrl(source);
  if (!url) return false;

  const hostname = url.hostname.toLowerCase();
  return isYouTubeHostname(hostname)
    || hostname === 'player.vimeo.com'
    || /\/(?:embed|iframe)(?:\/|$)/i.test(url.pathname);
};

const isUnsafeProtocol = (source) => /^(?:blob|data|file|javascript):/i.test(source);

const resolveAllowedHosts = (allowedHosts) => {
  if (Array.isArray(allowedHosts)) {
    return allowedHosts.map((host) => String(host).trim().toLowerCase()).filter(Boolean);
  }
  return String(allowedHosts || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
};

const isAllowedHost = (hostname, allowedHosts) => (
  !allowedHosts.length
  || allowedHosts.some((host) => isHostOrSubdomain(hostname, host))
);

export const isSafeNativeHeroVideoUrl = (source, options = {}) => {
  const src = String(source || '').trim();
  if (!src || isUnsafeProtocol(src) || isIframeVideoUrl(src)) return false;

  const parsed = parseHttpUrl(src);
  if (!parsed) {
    return Boolean(options.allowRelative);
  }

  if (options.isProduction && parsed.protocol !== 'https:') return false;
  const configuredHosts = resolveAllowedHosts(options.allowedHosts);
  return isAllowedHost(
    parsed.hostname.toLowerCase(),
    configuredHosts.length || !options.isProduction
      ? configuredHosts
      : ['res.cloudinary.com'],
  );
};

const getNativeSourceFields = (candidate) => {
  const src = typeof candidate?.videoUrl === 'string'
    ? candidate.videoUrl.trim()
    : typeof candidate?.src === 'string'
      ? candidate.src.trim()
      : '';
  const explicitMimeType = getExplicitVideoMimeType(candidate?.mimeType)
    || getExplicitVideoMimeType(candidate?.type);
  return {
    src,
    mimeType: explicitMimeType || inferNativeVideoMimeType(src),
  };
};

export const resolveConfiguredHeroVideoSource = (movie, options = {}) => {
  if (!movie || typeof movie !== 'object') return null;

  const src = typeof movie.heroVideoUrl === 'string'
    ? movie.heroVideoUrl.trim()
    : typeof movie.background_video_url === 'string'
      ? movie.background_video_url.trim()
      : '';
  if (!src) return null;

  const isMockUrl = src === '/mock/hero-trailer.mp4' || src.includes('/mock/hero-trailer.mp4');
  if (isMockUrl) {
    if (!options.mockEnabled || options.isProduction) return null;
  }

  if (movie.heroVideoStatus !== 'ready') return null;

  const explicitMimeType = getExplicitVideoMimeType(movie.heroVideoMimeType)
    || getExplicitVideoMimeType(movie.background_video_mime_type);
  const mimeType = explicitMimeType || inferNativeVideoMimeType(src);
  if (
    !HERO_NATIVE_VIDEO_MIME_TYPES.includes(mimeType)
    || !isSafeNativeHeroVideoUrl(src, {
      isProduction: Boolean(options.isProduction),
      allowedHosts: options.allowedHosts,
      allowRelative: Boolean(options.mockEnabled && isMockUrl),
    })
  ) return null;

  const version = String(movie.heroVideoVersion || movie.videoVersion || '').trim();
  const poster = String(
    movie.heroVideoPoster
    || movie.heroVideoPosterUrl
    || movie.videoPoster
    || '',
  ).trim();

  return {
    kind: 'native',
    src,
    mimeType,
    version,
    poster,
  };
};


export const canUseHeroBackgroundVideo = (movie, options = {}) => (
  Boolean(resolveConfiguredHeroVideoSource(movie, options))
);

export const canUseNativeHeroVideo = (movie, options = {}) => {
  if (!movie || typeof movie !== 'object') return false;
  return Boolean(resolveConfiguredHeroVideoSource(movie, options));
};
