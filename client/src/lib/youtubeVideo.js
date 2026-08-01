const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const isHostOrSubdomain = (hostname, domain) => (
  hostname === domain || hostname.endsWith(`.${domain}`)
);

const isYouTubeHostname = (hostname) => (
  isHostOrSubdomain(hostname, 'youtube.com')
  || isHostOrSubdomain(hostname, 'youtube-nocookie.com')
  || isHostOrSubdomain(hostname, 'youtu.be')
);

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
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || !isYouTubeHostname(url.hostname.toLowerCase())
  ) return null;

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
