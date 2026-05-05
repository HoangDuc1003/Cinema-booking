import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarIcon, ClockIcon, Star, Play, Ticket } from 'lucide-react';
import { fetchPopularMovies } from '../services/tmdb';
import BlurCircle from './BlurCircle';
import Loading from './Loading';
/* =========================================
   UTILITY FUNCTIONS
   ========================================= */
const getImageUrl = (path, size = 'original') => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

const formatRuntime = (minutes) => {
  if (!minutes) return 'N/A';
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

/* =========================================
   PERFORMANCE-OPTIMIZED CSS ANIMATIONS
   ========================================= */
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
  
  /* Pure White Vertical Flare (Tâm sáng ở ngay mép phải màn hình) */
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
    .hero-meta, .hero-overview { display: none !important; }
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

  .hero-title-word { filter: drop-shadow(0 6px 12px rgba(0,0,0,0.6)); }

  @media (prefers-reduced-motion: reduce) {
    .hero-fade-up, .d1, .d2, .d3, .d4, .hero-title span, .thumb-bar img {
      animation: none !important;
      transition: none !important;
    }
  }
`;

const HeroSection = () => {
  const navigate = useNavigate();
  const styleRef = useRef(false);

  /* --- STATE MANAGEMENT --- */
  const [movies, setMovies] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  
  // Animation states
  const [isFading, setIsFading] = useState(false);
  const [hideText, setHideText] = useState(false);
  const [flyKey, setFlyKey] = useState(0);

  /*ANIMATION SEQUENCE LOGIC*/
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

  /*DATA FETCHING & SETUP*/
  useEffect(() => {
    if (styleRef.current) return;
    styleRef.current = true;
    const el = document.createElement('style');
    el.textContent = STYLES;
    document.head.appendChild(el);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const data = await fetchPopularMovies({ includeDetails: true, detailLimit: 5, dailyRotate: true, dailySeedSize: 20 });
        setMovies(data.slice(0, 5));
      } catch (e) {
        console.error('Hero load error:', e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
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

  /*LOADING STATE*/
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
  
  const bgPath = movie.backdrop_original || movie.backdrop_w1280 || movie.backdrop_path;
  const bgUrl = getImageUrl(bgPath, 'original');
  const year = movie.release_date?.substring(0, 4) || 'N/A';
  const rating = movie.vote_average?.toFixed(1) || 'N/A';
  const runtimeStr = formatRuntime(movie.runtime);

  return (
    <div className="hero-section-container relative flex flex-col justify-center h-screen w-full overflow-hidden bg-[#0a0a0a] text-white">
      
      {/*BACKGROUND & LIGHT EFFECTS*/}
      <div className="absolute inset-0 z-0">
        <img
          key={`bg-${currentIndex}`}
          src={bgUrl}
          alt={movie.title}
          className="hero-backdrop w-full h-full object-cover object-center"
          style={{ opacity: 1 }} 
        />
        {/* Soft Breathing Dark Layer */}
        <div className="absolute inset-0 bg-black pointer-events-none will-change-opacity" 
             style={{ animation: 'cinematicBreathe 7s ease-in-out infinite', zIndex: 1 }} />
             
        {/* Lớp đen bên trái (Đã giảm độ tối 50%) */}
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.3) 25%, transparent 60%)', zIndex: 2 }} />

        {/* Bottom Gradient (Only for Thumbnail visibility) */}
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: 'linear-gradient(0deg, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.4) 15%, transparent 30%)', zIndex: 2 }} />
             
        {/* Vignette effect */}
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.3) 100%)', mixBlendMode: 'overlay', zIndex: 3 }} />
      </div>

      {/*PURE WHITE VERTICAL FLARE*/}
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
          animation: isFading ? 'verticalWhiteFlare 1.1s cubic-bezier(0.4, 0, 0.2, 1) forwards' : 'none',
          opacity: 0,
        }}
      />
      
      {/* Background Dip Transition */}
      <div
        key={`dark-${isFading}`}
        className="absolute inset-0 bg-black pointer-events-none will-change-opacity"
        style={{
          zIndex: 3,
          animation: isFading ? 'darkDipTransition 1.1s cubic-bezier(0.4, 0, 0.2, 1) forwards' : 'none',
          opacity: 0 
        }}
      />

      {/*MAIN TEXT CONTENT*/}
      <div
        className="relative z-10 px-8 md:px-14 lg:px-20 mb-12 transition-opacity duration-300 ease-out"
        style={{ 
          maxWidth: '45%', 
          minWidth: 320, 
          isolation: 'isolate',
          opacity: hideText ? 0 : 1 
        }}
      >
        {!hideText && (
          <div key={`content-block-${flyKey}`}>
            {movie.genres?.length > 0 && (
              <div className="hero-fade-up d1 flex flex-wrap gap-2 mb-4">
                {movie.genres.slice(0, 3).map((g) => (
                  <span key={g.id} className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-md cinematic-shadow"
                    style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            <h1 className="d1 hero-title font-black leading-[1.1] mb-5 cinematic-shadow text-white" 
                style={{ fontSize: 'clamp(36px, 4.5vw, 68px)', wordBreak: 'normal', overflowWrap: 'normal' }}>
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
              <span className="flex items-center gap-1.5"><ClockIcon className="w-4 h-4" />{runtimeStr}</span>
              <span className="flex items-center gap-1.5"><Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />{rating}</span>
            </div>

            <p className="hero-overview hero-fade-up d3 text-gray-200 text-base leading-relaxed mb-8 line-clamp-3  font-medium">
              {movie.overview}
            </p>

            <div className="hero-actions hero-fade-up d4 flex items-center gap-4 flex-wrap">
              <button onClick={() => navigate(`/movies/${movie.id}`)}
                className="group flex items-center gap-3 px-10 py-6 bg-linear-to-r from-primary to-primary-dull
                 hover:from-primary-dull hover:to-primary text-white font-semibold rounded-full shadow-lg shadow-primary/30 
                 hover:shadow-xl hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 border
                  border-primary/30 hover:border-primary/60 relative overflow-hidden">
                <Ticket className="w-6 h-6 " /> Book Now
              </button>
              <button className="group flex items-center gap-3 px-8 py-4 bg-white/15 hover:bg-white/25 text-white 
              font-semibold rounded-full border border-white/40 hover:border-primary/40 backdrop-blur-sm hover:scale-105 
              transition-all duration-300 relative overflow-hidden cursor-pointer">
                <Play className="w-4 h-4" /> Trailer
              </button>
            </div>
          </div>
        )}
      </div>
      {/*THUMBNAILS NAVIGATION*/}
      <div className="absolute bottom-8 left-8 md:left-14 lg:left-20 z-20 flex flex-col gap-3">
        <div className="flex items-center gap-2 mb-1">
          {movies.map((_, i) => (
            <button key={i} onClick={() => handleThumbClick(i)}
              className="rounded-full transition-all duration-500 ease-out"
              style={{ height: 6, width: i === currentIndex ? 32 : 6, background: i === currentIndex ? '#fff' : 'rgba(0,0,0,0.3)' }}
            />
          ))}
        </div>

        <div className="thumb-bar flex items-end gap-3 overflow-x-auto py-2 pr-4 pl-2">
          {movies.map((m, i) => {
            const isActive = i === currentIndex;
            const thumbUrl = getImageUrl(m.backdrop_path, 'w500');

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
    </div>
  );
};

export default HeroSection;