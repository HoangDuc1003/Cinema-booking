import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarIcon, ClockIcon, Star, Play, Ticket, ImageIcon, Video } from 'lucide-react';
import { fetchHomeHero, fetchMovieTrailers } from '../services/tmdb';
import Loading from './Loading';
import { dummyShowsData } from '../assets/assets';

const getImageUrl = (path, size = 'original') => {
  if (!path) return '';
  if (path.startsWith('http')) return path.replace('/t/p/original/', `/t/p/${size}/`);
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

const formatRuntime = (minutes) => {
  if (typeof minutes !== 'number' || Number.isNaN(minutes) || minutes <= 0) return 'N/A';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
};

const keepLastWordsTogether = (text = '', tailWords = 2) => {
  const t = String(text).trim();
  if (!t) return t;
  const words = t.split(/\s+/);
  if (words.length <= tailWords) return t;
  const head = words.slice(0, words.length - tailWords).join(' ');
  const tail = words.slice(words.length - tailWords).join('\u00A0');
  return head + ' ' + tail;
};

/**
 * Returns true if the image at `url` loads successfully, false otherwise.
 * Never rejects; always resolves. Cleans up event listeners on abort.
 */
const canLoadImage = (url, signal) =>
  new Promise((resolve) => {
    if (!url) { resolve(false); return; }
    if (signal?.aborted) { resolve(false); return; }
    const img = new Image();
    const onLoad = () => { cleanup(); resolve(true); };
    const onError = () => { cleanup(); resolve(false); };
    const onAbort = () => { cleanup(); resolve(false); };
    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    img.onload = onLoad;
    img.onerror = onError;
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    img.src = url;
  });

/**
 * For each movie, try candidate image URLs in priority order,
 * assign movie.heroImageUrl to the first valid one, drop movies with none.
 */
const validateMovieCandidates = async (movies, signal) => {
  const results = [];
  for (const movie of movies) {
    if (signal?.aborted) break;
    const candidates = [
      movie.backdrop_original,
      movie.backdrop_w1280,
      movie.backdrop_path,
      movie.poster_path,
    ];
    // Deduplicate while preserving order
    const seen = new Set();
    const unique = [];
    for (const c of candidates) {
      if (!c) continue;
      const normalized = getImageUrl(c, 'w1280');
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        unique.push(normalized);
      }
    }
    let heroImageUrl = null;
    for (const url of unique) {
      if (signal?.aborted) break;
      const ok = await canLoadImage(url, signal);
      if (ok) { heroImageUrl = url; break; }
    }
    if (heroImageUrl) {
      results.push({ ...movie, heroImageUrl });
    }
  }
  return results;
};

// CSS animations
const STYLES = `
  /* Hardware-accelerated text fade up */
  @keyframes fadeSlideUp {
    0%   { transform: translateY(20px); opacity: 0; }
    100% { transform: translateY(0);    opacity: 1; }
  }

  /* Subtle background breathing */
  @keyframes cinematicBreathe {
    0%, 100% { opacity: 0.05; }
    50%      { opacity: 0.2; } 
  }
  
  @keyframes panRight {
  0% { 
    transform: scale(1.1) translateX(-2%); 
  }
  100% { 
    transform: scale(1.1) translateX(2%); 
  }
}

.animate-pan-right {
  animation: panRight 10s linear forwards; 
}

  @keyframes verticalWhiteFlare {
    0%   { opacity: 0; transform: translateX(50%) scaleX(0.1) scaleY(1); }
    30%  { opacity: 1; transform: translateX(50%) scaleX(3.5) scaleY(1.1); } 
    50%  { opacity: 0.1; transform: translateX(50%) scaleX(0.3) scaleY(1); } 
    75%  { opacity: 0.9; transform: translateX(50%) scaleX(2.5) scaleY(1.05); } 
    100% { opacity: 0; transform: translateX(50%) scaleX(0.1) scaleY(1); } 
  }

  /* Soft dark dip for background transition */
  @keyframes darkDipTransition {
    0%, 100% { opacity: 0; }
    40%, 60% { opacity: 0.5; }
  }

  /* Per-character text fly-ins */
  @keyframes charFromLeft {
    0% { transform: translateX(-50px) translateY(5px) rotate(-4deg); opacity: 0; }
    100% { transform: translateX(0) translateY(0) rotate(0); opacity: 1; }
  }
  @keyframes charFromRight {
    0% { transform: translateX(50px) translateY(5px) rotate(4deg); opacity: 0; }
    100% { transform: translateX(0) translateY(0) rotate(0); opacity: 1; }
  }

  /* Animation Classes */
  .hero-fade-up { animation: fadeSlideUp 0.6s cubic-bezier(0.22,1,0.36,1) forwards; opacity: 0; }
  .d1 { animation-delay: 50ms;   }
  .d2 { animation-delay: 150ms; }
  .d3 { animation-delay: 250ms; }
  .d4 { animation-delay: 350ms; }
  
  /* Text shadow for readability */
  .cinematic-shadow {
    text-shadow: 0px 2px 10px rgba(0,0,0,0.8), 0px 4px 20px rgba(0,0,0,0.5);
  }

  /* Hide scrollbars */
  .thumb-bar::-webkit-scrollbar { display: none; }
  .thumb-bar { scrollbar-width: none; }

  /* Mobile Adjustments */
  @media (max-width: 640px) {
    .hero-title { font-size: clamp(24px, 6.5vw, 32px) !important; }
    .hero-overview { display: none !important; }
    .hero-meta { font-size: 12px !important; gap: 0.75rem !important; margin-bottom: 0.75rem !important; }
    .hero-actions { flex-wrap: nowrap !important; gap: 0.5rem !important; }
    .thumb-bar { gap: 0.5rem !important; padding: 0.5rem !important; }
    .thumb-bar img { height: 44px !important; }
  }

  /* Additional hero optimizations */
  .hero-section-container {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-text-size-adjust: 100%;
  }
    

  .hero-backdrop {
    will-change: transform, opacity;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    transform: translateZ(0);
    transition: transform 600ms ease-out, opacity 600ms ease-out;
    image-rendering: auto;
  }

  .hero-video-frame {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 100%;
    height: 100%;
    border: 0;
    pointer-events: none;
    transform: translate(-50%, -50%) scale(1.18);
    overflow: hidden;
  }

  .hero-title-word { filter: drop-shadow(0 6px 12px rgba(0,0,0,0.6)); }

  @media (prefers-reduced-motion: reduce) {
    .hero-fade-up, .d1, .d2, .d3, .d4, .hero-title span, .thumb-bar img {
      animation: none !important;
      transition: none !important;
    }
  }
`;

const HeroSection = ({ onWatchTrailer }) => {
  const navigate = useNavigate();
  const styleRef = useRef(false);

  const [movies, setMovies] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [mediaMode, setMediaMode] = useState('poster');
  const [heroTrailers, setHeroTrailers] = useState({});
  const [trailerLoadingId, setTrailerLoadingId] = useState(null);
  
  // Animation states
  const [isFading, setIsFading] = useState(false);
  const [hideText, setHideText] = useState(false);
  const [flyKey, setFlyKey] = useState(0);


  const switchTo = (getNextIndex) => {
    if (isFading) return;
    setIsFading(true);

    setHideText(true);
    setTimeout(() => {
      setCurrentIndex((prev) => typeof getNextIndex === 'function' ? getNextIndex(prev) : getNextIndex);
    }, 400);
    setTimeout(() => {
      setHideText(false);
      setFlyKey((k) => k + 1);
    }, 650);
    setTimeout(() => setIsFading(false), 1200);
  };


  useEffect(() => {
    if (styleRef.current) return;
    styleRef.current = true;
    const el = document.createElement('style');
    el.textContent = STYLES;
    document.head.appendChild(el);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const data = await fetchHomeHero({ signal: controller.signal });
        if (!controller.signal.aborted) {
          const rawMovies = Array.isArray(data.movies) && data.movies.length ? data.movies : dummyShowsData;
          const validMovies = await validateMovieCandidates(rawMovies, controller.signal);
          if (!controller.signal.aborted) {
            setMovies(validMovies.slice(0, 5));
          }
        }
      } catch (e) {
        if (e.name !== 'AbortError') console.error('Hero load error:', e);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, []);

  // Auto-slide
  useEffect(() => {
    if (!movies.length) return;
    const id = setInterval(() => switchTo((prev) => (prev + 1) % movies.length), 6000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies, isFading]);

  const handleThumbClick = (index) => {
    if (index === currentIndex || isFading) return;
    switchTo(index);
  };


  if (isLoading || !movies.length) {
    return (
      <div className="h-screen w-full bg-[#0a0a0a] flex items-center justify-center text-white text-sm tracking-widest uppercase">
        <div className="animate-pulse">
          <Loading/>
          </div>
      </div>
    );
  }

  const movie = movies[currentIndex];
  const titleTextRaw = movie.title || movie.name || '';
  const titleText = keepLastWordsTogether(titleTextRaw, 2);
  const titleWords = titleText.split(' ');
  
  const bgUrl = movie.heroImageUrl || getImageUrl(movie.backdrop_original || movie.backdrop_w1280 || movie.backdrop_path, 'w1280');
  const movieKey = String(movie.id || movie._id || currentIndex);
  const activeTrailer = heroTrailers[movieKey]?.[0] || null;
  const showVideo = mediaMode === 'trailer' && activeTrailer?.videoUrl;
  const year = movie.release_date?.substring(0, 4) || 'N/A';
  const rating = movie.vote_average?.toFixed(1) || 'N/A';
  const runtimeStr = formatRuntime(movie.runtime);

  const handleBackdropError = () => {
    setMovies((current) => {
      if (current.length <= 1) return current;
      const stableId = movie.id || movie._id;
      const next = stableId
        ? current.filter((m) => (m.id || m._id) !== stableId)
        : current.filter((_, index) => index !== currentIndex);
      setCurrentIndex((index) => Math.min(index, next.length - 1));
      return next;
    });
  };

  const handleMediaToggle = async () => {
    if (mediaMode === 'trailer') {
      setMediaMode('poster');
      return;
    }

    setMediaMode('trailer');
    if (heroTrailers[movieKey]) return;

    setTrailerLoadingId(movieKey);
    try {
      const trailers = await fetchMovieTrailers(movie);
      setHeroTrailers((current) => ({ ...current, [movieKey]: trailers }));
      if (!trailers.length) setMediaMode('poster');
    } catch {
      setMediaMode('poster');
    } finally {
      setTrailerLoadingId(null);
    }
  };

  // Derived animation flag: only run poster-transition effects when fading AND not in video mode
  const shouldRunPosterTransition = isFading && !showVideo;

  return (
    <div className="hero-section-container relative flex flex-col justify-center h-screen w-full overflow-hidden bg-[#0a0a0a] text-white">
      

      <div className="absolute inset-0 z-0">
        {showVideo ? (
          <div className="absolute inset-0 overflow-hidden">
            <iframe
              key={`hero-video-${movieKey}-${activeTrailer.id}`}
              src={`${activeTrailer.videoUrl}?autoplay=1&mute=1&controls=0&loop=1&playlist=${activeTrailer.videoUrl.split('/').pop()}&rel=0&modestbranding=1&playsinline=1`}
              title={`${movie.title} trailer`}
              className="hero-video-frame"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <img
            key={`bg-${currentIndex}`}
            src={bgUrl}
            alt={movie.title}
            fetchPriority={currentIndex === 0 ? 'high' : 'auto'}
            decoding="async"
            sizes="100vw"
            onError={handleBackdropError}
            className="hero-backdrop w-full h-full object-cover object-center animate-pan-right align-top"
            style={{ opacity: 1 }} 
          />
        )}
        {/* Soft Breathing Dark Layer */}
        <div className="absolute inset-0 bg-black pointer-events-none will-change-opacity" 
             style={{
               animation: showVideo ? 'none' : 'cinematicBreathe 7s ease-in-out infinite',
               opacity: showVideo ? 0.05 : undefined,
               zIndex: 1,
             }} />
             
        {/* Left dark gradient */}
        <div className="absolute inset-0 pointer-events-none"
             style={{
               background: showVideo
                 ? 'linear-gradient(90deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 25%, transparent 60%)'
                 : 'linear-gradient(90deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.3) 25%, transparent 60%)',
               zIndex: 2,
             }} />

        {/* Bottom Gradient (Only for Thumbnail visibility) */}
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: 'linear-gradient(0deg, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.4) 15%, transparent 30%)', zIndex: 2 }} />
             
        {/* Vignette effect */}
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.3) 100%)', mixBlendMode: 'overlay', zIndex: 3 }} />
      </div>


      <div
        key={`flare-${isFading}`}
        className="absolute inset-y-[-20%] right-0 w-[5vw] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(229, 9, 20, 0.4) 30%, rgba(229, 9, 20, 1) 50%, rgba(229, 9, 20, 0.4) 70%, transparent 100%)',
          mixBlendMode: 'screen',
          filter: 'blur(30px)',
          zIndex: 4,
          willChange: 'transform, opacity',
          transformOrigin: 'center center',
          animation: shouldRunPosterTransition ? 'verticalWhiteFlare 1.1s cubic-bezier(0.4, 0, 0.2, 1) forwards' : 'none',
          opacity: 0,
        }}
      />
      
      {/* Background Dip Transition */}
      <div
        key={`dark-${isFading}`}
        className="absolute inset-0 bg-black pointer-events-none will-change-opacity"
        style={{
          zIndex: 3,
          animation: shouldRunPosterTransition ? 'darkDipTransition 1.1s cubic-bezier(0.4, 0, 0.2, 1) forwards' : 'none',
          opacity: 0 
        }}
      />


      <div
        className="relative z-10 px-6 sm:px-8 md:px-14 lg:px-20 mb-8 sm:mb-12 max-md:mt-auto max-md:mb-20 transition-opacity duration-300 ease-out"
        style={{ 
          maxWidth: '45%', 
          minWidth: 280, 
          isolation: 'isolate',
          opacity: hideText ? 0 : 1 
        }}
      >
        {!hideText && (
          <div key={`content-block-${flyKey}`}>
            {movie.genres?.length > 0 && (
              <div className=" d1 flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-4">
                {movie.genres.slice(0, 3).map((g) => (
                  <span key={g.id} className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-widest  "
                    style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            <h1 className="d1 hero-title font-black leading-[1.1] mb-3 sm:mb-5 text-white " 
                style={{ fontSize: 'clamp(28px, 4.5vw, 54px)', wordBreak: 'normal', overflowWrap: 'normal' }}>
              {titleWords.map((word, wIndex) => {
                const animName = wIndex % 2 === 0 ? 'charFromLeft' : 'charFromRight';
                return (
                  <span key={`w-${wIndex}`} className="hero-title-word inline-block whitespace-nowrap mr-[0.3em] will-change-transform"
                    style={{ animation: `${animName} 700ms cubic-bezier(0.22,1,0.36,1) ${wIndex * 80}ms both` }}>
                    {word}
                  </span>
                );
              })}
            </h1>

            <div className="hero-meta hero-fade-up d2 flex items-center flex-wrap gap-5 text-[15px] font-medium text-white mb-6 cinematic-shadow">
              <span className="flex items-center gap-1.5"><CalendarIcon className="w-4 h-4" />{year}</span>
              <span className="flex items-center gap-1.5"><ClockIcon className="w-4 h-4" />{runtimeStr || "1h30m"}</span>
              <span className="flex items-center gap-1.5"><Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />{rating||"8.9"}</span>
            </div>

            <p className="hero-overview hero-fade-up text-gray-200 d3 text-sm sm:text-base leading-relaxed mb-4 sm:mb-8 line-clamp-3 sm:line-clamp-3 font-medium max-w-[400px]">
              {movie.overview}
            </p>

            <div className="hero-actions hero-fade-up d4 flex flex-nowrap items-center gap-2 sm:gap-3 md:gap-4">
              <button onClick={() => { navigate(`/movies/${movie._id || movie.id}`), window.scrollTo({top: 0,behavior:'smooth'})}}  //smooth scrolling to top
                className="group flex items-center gap-1.5 sm:gap-2 md:gap-3 px-4 py-2.5 sm:px-6 sm:py-3 md:px-10 md:py-5 bg-linear-to-r from-primary to-primary-dull
                 hover:from-primary-dull hover:to-primary text-white font-semibold rounded-full shadow-lg shadow-primary/30 
                 hover:shadow-xl hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 border
                  border-primary/30 hover:border-primary/60 relative overflow-hidden text-xs sm:text-sm md:text-base whitespace-nowrap">
                <Ticket className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" /> Book Now
              </button>
              <button
                type="button"
                onClick={() => onWatchTrailer?.(movie)}
                className="group flex items-center gap-1.5 sm:gap-2 md:gap-3 px-3.5 py-2 sm:px-5 sm:py-2.5 md:px-8 md:py-4 bg-white/15 hover:bg-white/25 text-white 
              font-semibold rounded-full border border-white/40 hover:border-primary/40 backdrop-blur-sm hover:scale-105 
              transition-all duration-300 relative overflow-hidden cursor-pointer text-xs sm:text-sm md:text-base whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Trailer
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-2 left-8 md:left-14 lg:left-20 z-20 hidden md:flex flex-col gap-3">
        <div className="flex items-center gap-2 mb-1 rgba(229,9,20,0.36)">
          {movies.map((_, i) => (
            <button key={i} onClick={() => handleThumbClick(i)}
              className="rounded-full transition-all duration-500 ease-out"
              style={{ height: 6, width: i === currentIndex ? 32 : 6, background: i === currentIndex ? '#fff' : 'rgba(229,9,20,0.36)' }}
            />
          ))}
        </div>

        <div className="thumb-bar flex items-end gap-3 overflow-x-auto py-2 pr-4 pl-2">
          {movies.map((m, i) => {
            const isActive = i === currentIndex;
            const thumbUrl = m.heroImageUrl || getImageUrl(m.backdrop_path || m.poster_path, 'w300');

            return (
              <button
                key={m.id}
                onClick={() => handleThumbClick(i)}
                className="shrink-0 rounded-xl overflow-hidden cursor-pointer relative group will-change-transform"
                style={{
                  width: isActive ? 140 : 100, 
                  height: isActive ? 80 : 56, 
                  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  outline: isActive ? '2px solid rgba(246, 69, 101) ' : '2px solid transparent', 
                  outlineOffset: 2,
                  boxShadow: isActive ? '0 8px 24px rgba(229,9,20,0.36)' : '0 4px 12px rgba(0,0,0,0.6)',
                }}
              >
                <img 
                  src={thumbUrl} 
                  alt={m.title} 
                  loading="lazy" 
                  decoding="async"
                  className={`w-full h-full object-cover transition-all duration-500 ${isActive ? 'scale-110 brightness-100' : 'brightness-50 group-hover:brightness-120'}`} 
                />
                <div className="absolute inset-0 flex items-end opacity-100"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 70%)' }}>
                  <p className="text-white px-2 pb-1.5 leading-tight truncate w-full text-left" style={{ fontSize: 10, fontWeight: isActive ? 700 : 500 }}>
                    {m.title}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={handleMediaToggle}
        disabled={trailerLoadingId === movieKey}
        className="absolute bottom-5 right-5 md:bottom-8 md:right-10 z-30 flex items-center gap-2 rounded-full border border-white/20 bg-black/35 px-4 py-2.5 text-xs md:text-sm font-semibold text-white backdrop-blur-xl shadow-lg shadow-black/30 transition-all duration-300 hover:border-primary/50 hover:bg-primary/20 active:scale-95 disabled:opacity-60"
      >
        {mediaMode === 'trailer' ? <ImageIcon className="w-4 h-4" /> : <Video className="w-4 h-4" />}
        {trailerLoadingId === movieKey ? 'Loading' : mediaMode === 'trailer' ? 'Poster' : 'Trailer'}
      </button>
    </div>
  );
};

export default HeroSection;
