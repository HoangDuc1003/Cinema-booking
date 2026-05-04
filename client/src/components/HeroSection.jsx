import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarIcon, ClockIcon, Star, Play, Ticket } from 'lucide-react';
import { fetchPopularMovies } from '../services/tmdb';

// chore: CSS animations for hero section
const STYLES = `
  @keyframes flyFromLeft {
    0%   { transform: translateX(-80px) skewX(-8deg); opacity: 0; }
    60%  { transform: translateX(6px)  skewX(2deg);  opacity: 1; }
    100% { transform: translateX(0)    skewX(0deg);  opacity: 1; }
  }
  @keyframes flyFromRight {
    0%   { transform: translateX(80px) skewX(8deg);  opacity: 0; }
    60%  { transform: translateX(-6px) skewX(-2deg); opacity: 1; }
    100% { transform: translateX(0)    skewX(0deg);  opacity: 1; }
  }
  @keyframes fadeSlideUp {
    0%   { transform: translateY(28px); opacity: 0; }
    100% { transform: translateY(0);    opacity: 1; }
  }
  @keyframes orb1 {
    0%,100% { transform: translate(0px, 0px)    scale(1);    }
    33%      { transform: translate(60px,-40px)  scale(1.18); }
    66%      { transform: translate(-40px,50px)  scale(0.90); }
  }
  @keyframes orb2 {
    0%,100% { transform: translate(0px,0px)    scale(1);    }
    40%      { transform: translate(-70px,40px) scale(1.22); }
    70%      { transform: translate(50px,-50px) scale(0.85); }
  }
  @keyframes orb3 {
    0%,100% { transform: translate(0px,0px)   scale(1);    }
    30%      { transform: translate(80px,60px) scale(1.15); }
    60%      { transform: translate(-60px,-30px) scale(0.92); }
  }
  .hero-fly-left  { animation: flyFromLeft  0.75s cubic-bezier(0.22,1,0.36,1) forwards; opacity:0; }
  .hero-fly-right { animation: flyFromRight 0.75s cubic-bezier(0.22,1,0.36,1) forwards; opacity:0; }
  .hero-fade-up   { animation: fadeSlideUp  0.65s cubic-bezier(0.22,1,0.36,1) forwards; opacity:0; }
  .d1 { animation-delay: 0ms;   }
  .d2 { animation-delay: 120ms; }
  .d3 { animation-delay: 220ms; }
  .d4 { animation-delay: 340ms; }
  .orb1 { animation: orb1 9s ease-in-out infinite; }
  .orb2 { animation: orb2 12s ease-in-out infinite; }
  .orb3 { animation: orb3 15s ease-in-out infinite; }

  .thumb-bar::-webkit-scrollbar { display: none; }
  .thumb-bar { scrollbar-width: none; }
  /* hero shine: diagonal, soft capsule, slower and fully fades */
  @keyframes shineDiag {
    0% {
      transform: translate(-150%, -30%) rotate(18deg);
      opacity: 0;
    }
    12% { opacity: 0.06; }
    40% {
      transform: translate(-40%, -8%) rotate(18deg);
      opacity: 0.18;
    }
    50% {
      transform: translate(0%, 0%) rotate(18deg);
      opacity: 0.32;
    }
    60% {
      transform: translate(40%, 8%) rotate(18deg);
      opacity: 0.18;
    }
    88% { opacity: 0.06; }
    100% {
      transform: translate(150%, 30%) rotate(18deg);
      opacity: 0;
    }
  }

  .hero-shine {
    position: absolute;
    left: -20%;
    top: 30%;
    width: 160%;
    height: 30%;
    pointer-events: none;
    z-index: 7;
    mix-blend-mode: screen;
    border-radius: 40%;
    /* soft diagonal band with transparent edges */
    background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.06) 70%, rgba(255,255,255,0) 100%);
    filter: blur(36px) saturate(1.03) contrast(1.02);
    transform: translate(-150%, -30%) rotate(18deg);
    animation: shineDiag 12s ease-in-out infinite;
    opacity: 0;
  }

  /* depth band: diagonal alternating light/dark stripes to add perceived depth */
  @keyframes depthMove {
    from { background-position: 0 0; }
    to { background-position: 240px 0; }
  }
  @keyframes depthPulse {
    0% { opacity: 0.42; }
    50% { opacity: 0.62; }
    100% { opacity: 0.42; }
  }
  .depth-band {
    position: absolute;
    left: -20%;
    top: 30%;
    width: 160%;
    height: 40%;
    pointer-events: none;
    z-index: 6;
    transform: rotate(18deg);
    /* alternating dark/light diagonal stripes */
    background-image: repeating-linear-gradient(135deg,
      rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 60px,
      rgba(255,255,255,0.07) 60px, rgba(255,255,255,0.07) 120px);
    opacity: 0.48;
    filter: blur(14px) saturate(1.02) contrast(0.98);
    animation: depthMove 10s linear infinite, depthPulse 8s ease-in-out infinite;
    border-radius: 30%;
    mix-blend-mode: multiply;
  }

  /* per-character title fly-in (alternate left/right) */
  @keyframes charFromLeft {
    0% { transform: translateX(-140px) translateY(6px) rotate(-6deg); opacity: 0; }
    60% { transform: translateX(10px) translateY(-2px) rotate(2deg); opacity: 1; }
    100% { transform: translateX(0) translateY(0) rotate(0); opacity: 1; }
  }
  @keyframes charFromRight {
    0% { transform: translateX(140px) translateY(6px) rotate(6deg); opacity: 0; }
    60% { transform: translateX(-10px) translateY(-2px) rotate(-2deg); opacity: 1; }
    100% { transform: translateX(0) translateY(0) rotate(0); opacity: 1; }
  }
  .char { display: inline-block; will-change: transform, opacity; opacity: 0; }
  .word { display: inline-block; will-change: transform, opacity; white-space: nowrap; opacity: 0; }

  /* Mobile rules: reduce hero text, hide details for compact layout */
  @media (max-width: 640px) {
    .hero-title { font-size: clamp(18px, 6.5vw, 28px) !important; }
    .hero-meta, .hero-overview, .hero-actions { display: none !important; }
    .thumb-bar { display: none !important; gap: 0.5rem !important; padding: 0.5rem !important; }
    .thumb-bar img { height: 44px !important; }
    .hero-shine, .depth-band { display: none !important; }
  }

  .hero-backdrop {
    will-change: transform, filter, opacity;
    filter: contrast(1.08) saturate(1.08) brightness(1.05);
  }
`;

// chore: Utility function to format duration
const formatRuntime = (minutes) => {
  if (!minutes) return 'N/A';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
};

// Keep the last `tailWords` words together by replacing spaces between them with non-breaking spaces
const keepLastWordsTogether = (text = '', tailWords = 2) => {
  const t = String(text).trim();
  if (!t) return t;
  const words = t.split(/\s+/);
  if (words.length <= tailWords) return t;
  const head = words.slice(0, words.length - tailWords).join(' ');
  const tail = words.slice(words.length - tailWords).join('\u00A0');
  return head + ' ' + tail;
};

const HeroSection = () => {
  // chore: Navigation setup
  const navigate  = useNavigate();
  // chore: Reference to prevent duplicate style injection
  const styleRef  = useRef(false);

  // chore: State management for hero section
  const [movies, setMovies]           = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading]     = useState(true);
  const [isFading, setIsFading]       = useState(false);
  const [flyKey, setFlyKey]           = useState(0);

  // feat: Handle switching between movies with fade animation
  const switchTo = (getNextIndex) => {
    setIsFading(true);
    setTimeout(() => {
      setCurrentIndex((prev) => {
        return typeof getNextIndex === 'function' ? getNextIndex(prev) : getNextIndex;
      });
      setFlyKey((k) => k + 1);
      setIsFading(false);
    }, 420);
  };

  useEffect(() => {
    // chore: Inject animation styles once
    if (styleRef.current) return;
    styleRef.current = true;
    const el = document.createElement('style');
    el.textContent = STYLES;
    document.head.appendChild(el);
  }, []);

  useEffect(() => {
    // feat: Fetch top 5 popular movies on component mount (include runtime for these)
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

  useEffect(() => {
    // feat: Auto-rotate movies every 5 seconds
    if (!movies.length) return;
    const id = setInterval(() => switchTo((prev) => (prev + 1) % movies.length), 5000);
    return () => clearInterval(id);
  }, [movies]);

  // chore: Handle thumbnail click navigation
  const handleThumbClick = (index) => {
    if (index === currentIndex || isFading) return;
    switchTo(() => index);
  };

  // feat: Loading state UI
  if (isLoading || !movies.length) {
    return (
      <div className="h-screen w-full bg-[#0a0a0a] flex items-center justify-center text-white text-sm">
        Loading movies...
      </div>
    );
  }

  const movie      = movies[currentIndex];
  const titleTextRaw = movie.title || movie.name || '';
  const titleText  = keepLastWordsTogether(titleTextRaw, 2);
  const titleWords = titleText.split(' ');
  // choose highest-quality backdrop available for hero
  const bgUrl      = movie.backdrop_original || movie.backdrop_w1280 || movie.backdrop_path || movie.backdrop_w780 || movie.poster_path;
  const year       = movie.release_date?.substring(0, 4) || 'N/A';
  const rating     = movie.vote_average?.toFixed(1) || 'N/A';

  // fix: Corrected 'movieruntime' to 'runtime'
  const runtimeStr = formatRuntime(movie.runtime);

  return (
    <div className="relative flex flex-col justify-center h-screen w-full overflow-hidden bg-[#0a0a0a] text-white">
      {/* chore: Hero backdrop with image and gradients */}
      <div
        className="absolute inset-0 z-0"
        style={{ transition: 'opacity 420ms ease', opacity: isFading ? 0 : 1 }}
      >
        {/* feat: Background image (high-res for hero) */}
        <img
          src={bgUrl}
          alt={movie.title}
          loading="eager"
          decoding="sync"
          className="w-full h-full object-cover object-center hero-backdrop"
          style={{ opacity: 0.48 }}
        />
        {/* feat: Moving shine overlay to brighten and add depth */}
        <div className="hero-shine" aria-hidden="true" />
        {/* feat: Diagonal depth band (stripes) */}
        <div className="depth-band" aria-hidden="true" />
        {/* feat: Gradient overlays for better text readability */}
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 32%, transparent 65%)', zIndex: 8 }} />
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, #0a0a0a 0%, transparent 40%)', zIndex: 8 }} />
      </div>

      {/* chore: Animated decorative blobs */}
      <div className="orb1 absolute z-0 pointer-events-none"
        style={{ top: '8%', left: '4%', width: 420, height: 420,
          background: 'radial-gradient(circle, rgba(229,9,20,0.22) 0%, transparent 70%)', filter: 'blur(60px)' }} />

      {/* ── TEXT CONTENT ── */}
      <div
        key={flyKey}
        className="relative z-10 px-8 md:px-14 lg:px-20 mb-10"
        style={{
          maxWidth: '32%',
          minWidth: 280,
          opacity: isFading ? 0 : 1,
          transition: 'opacity 420ms ease',
          marginTop: '-20px',
          background: 'transparent',
          isolation: 'isolate',
        }}
      >
        {/* Genre tags */}
        {movie.genres?.length > 0 && (
          <div className="hero-fade-up d1 flex flex-wrap gap-2 mb-4">
            {movie.genres.slice(0, 3).map((g) => (
              <span key={g.id}
                className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
                style={{ background: 'rgba(229,9,20,0.18)', border: '1px solid rgba(229,9,20,0.35)', color: '#ff6b6b' }}>
                {g.name}
              </span>
            ))}
          </div>
        )}

        {/* Title (words animate as groups) */}
        <h1 key={`title-${flyKey}`} className={`d1 hero-title font-black leading-tight mb-4`} style={{ fontSize: 'clamp(30px, 3.2vw, 56px)', display: 'inline-block', lineHeight: '1', wordBreak: 'normal', overflowWrap: 'normal', hyphens: 'none' }} aria-label={titleTextRaw}>
          {titleWords.map((word, wIndex) => {
            const fromLeft = (wIndex % 2) === 0;
            const delay = wIndex * 140;
            const animName = fromLeft ? 'charFromLeft' : 'charFromRight';
            return (
              <span
                key={`w-${wIndex}`}
                className="word d1"
                style={{ animation: `${animName} 900ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both`, display: 'inline-block', whiteSpace: 'nowrap', marginRight: '0.35em' }}>
                {word}
              </span>
            );
          })}
        </h1>

        {/* Meta */}
        <div className="hero-fade-up d2 flex items-center flex-wrap gap-4 text-base font-medium text-gray-300 mb-5">
          <span className="flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 text-red-500" />{year}
          </span>
          <span className="flex items-center gap-1.5">
            <ClockIcon className="w-3.5 h-3.5 text-red-500" />{runtimeStr}
          </span>
          <span className="flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />{rating}
          </span>
        </div>

        {/* Overview */}
        <p className="hero-fade-up d3 text-gray-400 text-base leading-relaxed mb-8 line-clamp-3">
          {movie.overview}
        </p>

        {/* Buttons */}
        <div className="hero-fade-up d4 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => navigate(`/movie/${movie.id}`)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm transition-all duration-300 hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #e50914 0%, #b80710 100%)',
              boxShadow: '0 6px 24px rgba(229,9,20,0.40)',
            }}>
            <Ticket className="w-4 h-4" />Book Now
          </button>
          <button className="flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm transition-all duration-300 hover:bg-white/10"
            style={{ border: '1px solid rgba(255,255,255,0.25)' }}>
            <Play className="w-4 h-4" />Trailer
          </button>
        </div>
      </div>

      {/* ── THUMBNAIL STRIP ── */}
      <div className="absolute bottom-8 left-8 md:left-14 lg:left-20 z-20 flex flex-col gap-3">
        {/* Dots indicator */}
        <div className="flex items-center gap-2 mb-1">
          {movies.map((_, i) => (
            <button
              key={i}
              onClick={() => handleThumbClick(i)}
              style={{
                transition: 'all 0.45s ease', borderRadius: 9999, height: 6,
                width: i === currentIndex ? 28 : 6, background: i === currentIndex ? '#e50914' : 'rgba(255,255,255,0.3)',
                border: 'none', cursor: 'pointer', padding: 0,
              }}
            />
          ))}
        </div>

        {/* Thumbnail row */}
        <div className="thumb-bar flex items-end gap-2.5 overflow-x-auto py-4 px-3 -ml-3">
  {movies.map((m, i) => {
    const isActive = i === currentIndex;
    const thumbUrl = m.backdrop_path;

    return (
      <button
        key={m.id}
        onClick={() => handleThumbClick(i)}
                className="shrink-0 rounded-xl overflow-hidden cursor-pointer relative"
                style={{
                  width: isActive ? 120 : 88, height: isActive ? 68 : 50, transition: 'all 0.42s cubic-bezier(0.4,0,0.2,1)',
                  outline: isActive ? '2px solid #e50914' : '2px solid transparent', outlineOffset: 2,
                  boxShadow: isActive ? '0 6px 24px rgba(229,9,20,0.45), 0 0 0 1.5px rgba(229,9,20,0.3)' : '0 2px 8px rgba(0,0,0,0.5)',
                  filter: isActive ? 'brightness(1)' : 'brightness(0.55)',
                }}
              >
                <img src={thumbUrl} alt={m.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-end"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 60%)' }}>
                  <p className="text-white px-1.5 pb-1 leading-tight truncate"
                    style={{ fontSize: 9, fontWeight: 700 }}>
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