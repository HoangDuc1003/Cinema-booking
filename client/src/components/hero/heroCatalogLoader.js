import { dummyShowsData } from '../../assets/assets';
import { buildHeroImageCandidates } from './heroImages';
import { resolveConfiguredHeroVideoSource } from './heroMock';

export const HERO_MAX_MOVIES = 5;
export const HERO_CACHE_KEY = 'nitrocine:hero-catalog-cache-v1';

export const getNow = () => performance.now();

export const getHeroMovieKey = (movie, fallback = '') => String(movie?.id || movie?._id || fallback);

export const formatRuntime = (minutes) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
};

export const selectBestHeroMovies = (movies) => {
  if (!Array.isArray(movies) || !movies.length) return dummyShowsData.slice(0, HERO_MAX_MOVIES);
  const scored = movies.map((m) => {
    const popularity = Number(m.popularity) || 0;
    const voteAverage = Number(m.vote_average) || 0;
    const voteCount = Number(m.vote_count) || 0;
    const hasBackdrop = Boolean(m.backdrop_path || m.backdrop_original);
    const hasNative = Boolean(resolveConfiguredHeroVideoSource(m));
    const releaseYear = Number((m.release_date || '').slice(0, 4)) || 0;
    const isRecent = releaseYear >= new Date().getFullYear() - 1;

    const score = popularity * 0.3
      + voteAverage * 10
      + (voteCount > 100 ? 15 : 0)
      + (hasBackdrop ? 30 : 0)
      + (hasNative ? 50 : 0)
      + (isRecent ? 25 : 0);

    return { movie: m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, HERO_MAX_MOVIES).map((item) => item.movie);
};

export const canLoadImage = (url, signal, timeoutMs = 6_000) => new Promise((resolve) => {
  if (!url || signal?.aborted) {
    resolve(false);
    return;
  }

  const image = new Image();
  let settled = false;
  let timeoutId;
  const cleanup = () => {
    window.clearTimeout(timeoutId);
    image.onload = null;
    image.onerror = null;
    signal?.removeEventListener('abort', handleAbort);
  };
  const finish = (loaded) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolve(loaded);
  };
  const handleAbort = () => {
    finish(false);
  };

  image.onload = () => {
    finish(image.naturalWidth > 0 && image.naturalHeight > 0);
  };
  image.onerror = () => {
    finish(false);
  };
  signal?.addEventListener('abort', handleAbort, { once: true });
  timeoutId = window.setTimeout(() => finish(false), timeoutMs);
  image.src = url;
});

export const validateMovieCandidates = async (movies, signal) => {
  const findFirstLoadable = async (candidates) => {
    for (const url of candidates) {
      if (signal?.aborted) return '';
      if (await canLoadImage(url, signal)) return url;
    }
    return '';
  };

  const putFirst = (candidates, selected) => (
    selected ? [selected, ...candidates.filter((candidate) => candidate !== selected)] : candidates
  );

  const validateMovie = async (movie) => {
    const desktopCandidates = [
      ...buildHeroImageCandidates([
        movie.backdrop_original,
        movie.backdrop_path,
        movie.backdrop_w1280,
        movie.poster_path,
      ], 'original'),
      ...buildHeroImageCandidates([
        movie.backdrop_original,
        movie.backdrop_w1280,
        movie.backdrop_path,
        movie.poster_path,
      ], 'w1280'),
    ];
    const mobileCandidates = [
      ...buildHeroImageCandidates([
        movie.poster_path,
        movie.backdrop_original,
        movie.backdrop_w1280,
        movie.backdrop_path,
      ], 'original'),
      ...buildHeroImageCandidates([
        movie.poster_path,
        movie.backdrop_original,
        movie.backdrop_w1280,
        movie.backdrop_path,
      ], 'w780'),
    ];

    const [heroImageUrl, heroMobileImageUrl] = await Promise.all([
      findFirstLoadable(desktopCandidates),
      findFirstLoadable(mobileCandidates),
    ]);
    const fallbackUrl = heroImageUrl || heroMobileImageUrl;
    if (!fallbackUrl) return null;

    return {
      ...movie,
      heroImageUrl: heroImageUrl || fallbackUrl,
      heroMobileImageUrl: heroMobileImageUrl || fallbackUrl,
      heroImageCandidates: putFirst(desktopCandidates, heroImageUrl || fallbackUrl),
      heroMobileImageCandidates: putFirst(mobileCandidates, heroMobileImageUrl || fallbackUrl),
      heroVideoStatus: movie.heroVideoStatus || (movie.heroVideoUrl ? 'ready' : ''),
      heroVideoMimeType: movie.heroVideoMimeType || (movie.heroVideoUrl ? 'video/mp4' : ''),
      heroVideoUrl: movie.heroVideoUrl || '',
    };
  };

  const results = await Promise.all(movies.slice(0, HERO_MAX_MOVIES).map(validateMovie));
  return results.filter(Boolean);
};

export const getInitialHeroMovies = () => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const cached = window.sessionStorage.getItem(HERO_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
  } catch {
    /* ignore storage errors */
  }
  return [];
};

export const saveHeroMoviesCache = (movies) => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage && Array.isArray(movies) && movies.length > 0) {
      window.sessionStorage.setItem(HERO_CACHE_KEY, JSON.stringify(movies));
    }
  } catch {
    /* ignore storage errors */
  }
};
