// Native Hero trailers: short video files played by a <video> element with no
// controls, so no player chrome can ever flash over the Hero (unlike a YouTube
// embed). TMDB only links YouTube, so the files come from configuration.

const VIDEO_TYPES = Object.freeze({ '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm' });

// Open-licence clips (Blender Foundation, CC BY 3.0) for trying the mechanism
// locally before real, licensed trailers exist. Never served in production.
export const DEMO_HERO_VIDEOS = Object.freeze([
    // Letterboxed 2.35:1 inside 16:9, so it is zoomed until the black bars are gone.
    { src: 'https://download.blender.org/durian/trailer/sintel_trailer-720p.mp4', zoom: 1.34 },
    'https://download.blender.org/peach/trailer/trailer_iphone.m4v',
    'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_2MB.mp4',
    'https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_2MB.mp4',
    'https://test-videos.co.uk/vids/jellyfish/mp4/h264/720/Jellyfish_720_10s_2MB.mp4',
]);
const DEMO_HOSTS = Object.freeze(['download.blender.org', 'test-videos.co.uk']);

const isProduction = (env) => String(env.NODE_ENV || '').toLowerCase() === 'production'
    || String(env.VERCEL_ENV || '').toLowerCase() === 'production';

const MAX_ZOOM = 1.5;

const listFrom = (value) => String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);

/**
 * A usable video source, or null. Only https files with a known video extension
 * on an allowed host pass, so a bad config entry cannot put an arbitrary URL in
 * front of every visitor.
 *
 * An entry is a URL, or { src, zoom } where zoom (1 to 1.5) crops the black bars
 * that many trailers have baked into the picture.
 */
export const toHeroVideo = (value, allowedHosts) => {
    const entry = value && typeof value === 'object' ? value : { src: value };
    const zoom = Math.min(Math.max(Number(entry.zoom) || 1, 1), MAX_ZOOM);
    try {
        const url = new URL(String(entry.src || ''));
        const extension = url.pathname.slice(url.pathname.lastIndexOf('.')).toLowerCase();
        if (url.protocol !== 'https:' || !VIDEO_TYPES[extension]) return null;
        if (!allowedHosts.includes(url.hostname.toLowerCase())) return null;
        return { src: url.toString(), type: VIDEO_TYPES[extension], zoom };
    } catch {
        return null;
    }
};

/**
 * Adds `trailerVideo` ({ src, type } or null) to each Hero movie.
 *
 * - HERO_TRAILER_VIDEOS: JSON object of TMDB movie ID to a video URL or { src, zoom }.
 * - HERO_VIDEO_ALLOWED_HOSTS: comma-separated hosts those URLs may use.
 * - HERO_DEMO_VIDEOS=true (never in production): movies without a configured
 *   video get one of the open-licence demo clips by position.
 */
// This runs on every public Hero request, so the JSON is parsed (and a bad value
// reported) once per distinct setting rather than once per visitor.
let parsedConfig = { raw: undefined, value: {} };
const readConfiguredVideos = (raw = '{}') => {
    if (raw === parsedConfig.raw) return parsedConfig.value;
    let value = {};
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) value = parsed;
    } catch {
        console.warn(JSON.stringify({ event: 'hero-trailer-videos-invalid-json' }));
    }
    parsedConfig = { raw, value };
    return value;
};

export const attachHeroVideos = (movies, env = process.env) => {
    const configured = readConfiguredVideos(env.HERO_TRAILER_VIDEOS || '{}');
    const demo = !isProduction(env) && String(env.HERO_DEMO_VIDEOS || '').toLowerCase() === 'true';
    const allowedHosts = [...listFrom(env.HERO_VIDEO_ALLOWED_HOSTS), ...(demo ? DEMO_HOSTS : [])];

    return movies.map((movie, index) => {
        const id = String(movie?._id ?? movie?.id ?? '');
        const trailerVideo = toHeroVideo(configured[id], allowedHosts)
            || (demo ? toHeroVideo(DEMO_HERO_VIDEOS[index % DEMO_HERO_VIDEOS.length], allowedHosts) : null);
        return { ...movie, trailerVideo };
    });
};
