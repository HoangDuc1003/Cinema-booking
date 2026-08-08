import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Star, ChevronLeft, ChevronRight, Play, Film } from 'lucide-react';
import Loading from './Loading';
import BlurCircle from './BlurCircle';
import { useHomeData } from '../context/HomeDataContext';
import { useMediaQuery, useSaveData } from './hero/useHeroEnvironment';
import { resolveConfiguredHeroVideoSource } from './hero/heroVideoSource';
import { isHeroTrailerMockEnabled } from './hero/heroMock';

const CARD_SLIDE_INTERVAL = 4000;

const resolveNativeTrailerSource = (movie) => {
  if (!movie || typeof movie !== 'object') return null;

  const configured = resolveConfiguredHeroVideoSource(movie, {
    mockEnabled: isHeroTrailerMockEnabled(),
    isProduction: import.meta.env.PROD,
    allowRelative: true,
  });
  return configured?.src ? configured : null;
};

const mergeMovieList = (...lists) => {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    for (const movie of list || []) {
      const key = String(movie?._id || movie?.id || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(movie);
    }
  }
  return merged;
};

const NativeTrailerSection = ({ featuredMovie = null, sectionId = 'home-trailer-section' }) => {
  const { hero, nowShowing, heroStatus, nowShowingStatus } = useHomeData();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const saveData = useSaveData();

  const carouselRef = useRef(null);
  const styleRef = useRef(false);
  const videoRef = useRef(null);

  const trailers = useMemo(() => {
    const heroMovies = Array.isArray(hero?.movies) ? hero.movies : [];
    const nowMovies = Array.isArray(nowShowing) ? nowShowing : [];
    return mergeMovieList(featuredMovie ? [featuredMovie] : [], heroMovies, nowMovies);
  }, [featuredMovie, hero, nowShowing]);
  const currentTrailer = trailers[Math.min(currentIndex, Math.max(trailers.length - 1, 0))] || null;
  const nativeSource = resolveNativeTrailerSource(currentTrailer);

  const switchTrailer = useCallback((index) => {
    if (index === currentIndex || !trailers.length) return;
    setCurrentIndex(index);
  }, [currentIndex, trailers.length]);

  useEffect(() => {
    if (styleRef.current) return;
    styleRef.current = true;
    const s = document.createElement('style');
    s.textContent = `
      .ts-content-shell { position:relative; width:100%; max-width:1248px; margin-inline:auto; }
      .ts-nav-btn { width:42px; height:42px; border-radius:50%; background:rgba(255,255,255,0.06); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; cursor:pointer; color:#d1d5db; transition:all 0.25s ease; flex-shrink:0; }
      .ts-nav-btn:hover { background:rgba(248,69,101,0.2); border-color:rgba(248,69,101,0.4); color:#fff; transform:scale(1.08); }
      .ts-carousel-wrap { position:relative; width:100%; max-width:100%; margin:32px auto 0; }
      .ts-carousel-inner { display:flex; align-items:center; gap:10px; }
      .ts-carousel-track { display:flex; gap:12px; overflow-x:auto; flex:1; scroll-behavior:smooth; scrollbar-width:none; scroll-snap-type:x mandatory; padding-bottom:6px; }
      .ts-carousel-track::-webkit-scrollbar { display:none; }
      .ts-card { flex:0 0 clamp(180px,18.5%,260px); min-width:0; cursor:pointer; border-radius:12px; overflow:hidden; background:rgba(15,17,28,0.9); border:1.5px solid rgba(255,255,255,0.06); transition:all 0.4s cubic-bezier(0.4,0,0.2,1); position:relative; scroll-snap-align:start; }
      .ts-card:hover { transform:translateY(-4px); border-color:rgba(248,69,101,0.5); box-shadow:0 12px 28px rgba(0,0,0,0.4),0 0 0 1px rgba(248,69,101,0.15); }
      .ts-card:focus-visible { outline:3px solid #fff; outline-offset:3px; border-color:rgba(248,69,101,0.8); transform:translateY(-4px); }
      .ts-card.active { border-color:rgba(248,69,101,0.8); box-shadow:0 0 20px rgba(248,69,101,0.2),0 8px 24px rgba(0,0,0,0.5); }
      .ts-card-thumb { position:relative; width:100%; aspect-ratio:16/9; overflow:hidden; }
      .ts-card-thumb img { width:100%; height:100%; object-fit:cover; display:block; transition:transform 0.5s ease; }
      .ts-card:hover .ts-card-thumb img { transform:scale(1.08); }
      .ts-card-play { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.3); opacity:0; transition:opacity 0.3s ease; }
      .ts-card:hover .ts-card-play { opacity:1; }
      .ts-card-play-icon { width:30px; height:30px; border-radius:50%; background:rgba(248,69,101,0.85); display:flex; align-items:center; justify-content:center; border:2px solid rgba(255,255,255,0.3); transition:transform 0.25s ease; }
      .ts-card:hover .ts-card-play-icon { transform:scale(1.1); }
      .ts-card-rating { position:absolute; top:5px; left:5px; background:rgba(0,0,0,0.6); backdrop-filter:blur(6px); padding:2px 6px; border-radius:5px; font-size:0.62rem; font-weight:700; color:#facc15; display:flex; align-items:center; gap:3px; z-index:5; }
      .ts-card-meta { padding:7px 9px; }
      .ts-card-title { color:#fff; font-weight:600; font-size:0.77rem; line-height:1.35; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .ts-card-sub { color:#6b7280; font-size:0.67rem; margin-top:2px; display:flex; align-items:center; justify-content:space-between; }
      .ts-card.active::after { content:''; position:absolute; bottom:0; left:10%; right:10%; height:2px; background:linear-gradient(90deg,transparent,#F84565,transparent); border-radius:2px; }
      .ts-dots { display:flex; align-items:center; justify-content:center; gap:7px; margin-top:14px; }
      .ts-dot { width:7px; height:7px; border-radius:50%; background:rgba(255,255,255,0.2); border:none; cursor:pointer; transition:all 0.3s ease; padding:0; }
      .ts-dot:hover { background:rgba(255,255,255,0.4); }
      .ts-dot.active { width:22px; border-radius:9999px; background:#F84565; }
      .ts-hint { max-width:100%; margin:8px auto 0; text-align:center; font-size:0.72rem; color:#4b5563; letter-spacing:0.5px; }
      @media (max-width:768px) {
        .ts-nav-btn { width:34px; height:34px; }
        .ts-carousel-track { gap:8px; }
        .ts-card { flex:0 0 min(44%,260px); }
      }
      @media (max-width:480px) {
        .ts-card-meta { padding:5px 7px; }
        .ts-card-title { font-size:0.7rem; }
        .ts-card-sub { font-size:0.6rem; }
        .ts-card { flex:0 0 62%; }
      }
      @media (prefers-reduced-motion:reduce) {
        .ts-nav-btn,.ts-card,.ts-card-thumb img,.ts-card-play,.ts-card-play-icon,.ts-dot { animation:none!important; transition:none!important; transform:none!important; }
      }
    `;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!featuredMovie || trailers.length === 0) return undefined;
    const featuredId = String(featuredMovie._id || featuredMovie.id || '');
    const foundIndex = trailers.findIndex((t) => String(t._id || t.id || '') === featuredId);
    if (foundIndex >= 0 && foundIndex !== currentIndex) {
      const handle = requestAnimationFrame(() => {
        setCurrentIndex(foundIndex);
      });
      return () => cancelAnimationFrame(handle);
    }
    return undefined;
  }, [featuredMovie, trailers, currentIndex]);

  useEffect(() => {
    if (trailers.length === 0 || carouselPaused || reducedMotion || saveData) return undefined;
    const id = setInterval(() => {
      if (!carouselRef.current) return;
      const c = carouselRef.current;
      const w = (c.firstElementChild?.offsetWidth || 0) + 12;
      const atEnd = c.scrollLeft + c.clientWidth >= c.scrollWidth - 10;
      c.scrollTo({ left: atEnd ? 0 : c.scrollLeft + w, behavior: 'smooth' });
    }, CARD_SLIDE_INTERVAL);
    return () => clearInterval(id);
  }, [trailers.length, carouselPaused, reducedMotion, saveData]);

  const handleScroll = () => {
    if (!carouselRef.current) return;
    const w = (carouselRef.current.firstElementChild?.offsetWidth || 0) + 12 || 1;
    const i = Math.round(carouselRef.current.scrollLeft / w);
    if (i !== activeIndex) setActiveIndex(i);
  };

  const scrollCarousel = (dir) => {
    if (!carouselRef.current) return;
    const w = (carouselRef.current.firstElementChild?.offsetWidth || 0) + 12;
    carouselRef.current.scrollBy({ left: dir * w, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  if (heroStatus === 'loading' && nowShowingStatus === 'loading') return <div className="px-6 md:px-16 lg:px-24 py-20"><Loading /></div>;

  return (
    <section id={sectionId} className="scroll-mt-20 px-6 md:px-16 lg:px-24 py-16 md:py-20 relative overflow-hidden min-h-screen md:min-h-[80vh]">
      <BlurCircle top="220px" right="-60px" delay="0.5s" />
      <BlurCircle top="600px" left="-65px" delay="1s" />
      <BlurCircle top="800px" right="-100px" delay="1.5s" />
      <BlurCircle top="240px" left="0" delay="2s" />

      <div className="ts-content-shell relative z-10">
        <div className="flex items-end justify-between max-w-[1248px] mx-auto mb-8 relative z-10">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-wide">Trailers</h2>
        </div>

        {currentTrailer ? (
          <div className="relative z-10 w-full mb-8">
            {nativeSource ? (
              <div className="relative aspect-video w-full max-w-[1248px] mx-auto rounded-xl overflow-hidden bg-black border border-white/10 shadow-2xl">
                <video
                  key={nativeSource.src}
                  ref={videoRef}
                  src={nativeSource.src}
                  poster={currentTrailer.backdrop_path || currentTrailer.poster_path || currentTrailer.heroImageUrl || nativeSource.poster}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="relative aspect-video w-full max-w-[1248px] mx-auto rounded-xl overflow-hidden bg-slate-950 flex flex-col items-center justify-center border border-white/10 shadow-2xl">
                <img
                  src={currentTrailer.backdrop_path || currentTrailer.poster_path || currentTrailer.heroImageUrl}
                  alt={currentTrailer.title}
                  className="absolute inset-0 w-full h-full object-cover opacity-50"
                />
                <div className="relative z-10 text-center p-6 bg-black/70 backdrop-blur-md rounded-xl max-w-md mx-auto border border-white/10">
                  <Film className="w-12 h-12 mx-auto text-rose-500 mb-3" />
                  <h3 className="text-xl font-bold text-white mb-1">{currentTrailer.title}</h3>
                  <p className="text-xs text-gray-300 mb-3">Native video trailer preview unavailable. Showing poster fallback.</p>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-rose-500/20 text-rose-400 rounded-full text-xs font-semibold border border-rose-500/30">
                    <span>{currentTrailer.release_date?.substring(0, 4) || 'N/A'}</span>
                    {currentTrailer.vote_average && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          {Number(currentTrailer.vote_average).toFixed(1)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="relative z-10 mx-auto mb-8 flex min-h-[360px] max-w-[1248px] flex-col items-center justify-center rounded-xl border border-white/10 bg-slate-950/80 px-6 text-center shadow-2xl" role="status">
            <Film className="mb-3 h-12 w-12 text-rose-500" aria-hidden="true" />
            <p className="text-lg font-semibold text-white">Trailer previews are temporarily unavailable.</p>
            <p className="mt-2 text-sm text-gray-400">Please check back shortly.</p>
          </div>
        )}

        {trailers.length > 0 && <div
          className="ts-carousel-wrap relative z-10"
          onMouseEnter={() => setCarouselPaused(true)}
          onMouseLeave={() => setCarouselPaused(false)}
        >
          <div className="ts-carousel-inner">
            <button className="ts-nav-btn hidden md:flex" onClick={() => scrollCarousel(-1)} aria-label="Previous thumbnails">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="ts-carousel-track" ref={carouselRef} onScroll={handleScroll}>
              {trailers.map((t, i) => (
                <button
                  key={t._id || t.id || i}
                  type="button"
                  className={`ts-card ${currentIndex === i ? 'active' : ''}`}
                  onClick={() => switchTrailer(i)}
                  aria-label={`Select native trailer for ${t.title}`}
                  aria-pressed={currentIndex === i}
                >
                  <div className="ts-card-thumb">
                    <img src={t.backdrop_path || t.poster_path || t.heroImageUrl} alt={t.title} loading="lazy" decoding="async" />
                    <div className="ts-card-play">
                      <div className="ts-card-play-icon">
                        <Play className="w-3 h-3 text-white fill-white ml-0.5" />
                      </div>
                    </div>
                    {t.vote_average && (
                      <div className="ts-card-rating">
                        <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                        {Number(t.vote_average).toFixed(1)}
                      </div>
                    )}
                  </div>
                  <div className="ts-card-meta">
                    <p className="ts-card-title">{t.title}</p>
                    <div className="ts-card-sub">
                      <span>{t.release_date?.substring(0, 4) || 'N/A'}</span>
                      <span>HD Native</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <button className="ts-nav-btn hidden md:flex" onClick={() => scrollCarousel(1)} aria-label="Next thumbnails">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="ts-dots">
            {trailers.map((_, i) => (
              <button
                key={i}
                className={`ts-dot ${activeIndex === i ? 'active' : ''}`}
                onClick={() => {
                  if (carouselRef.current) {
                    const w = (carouselRef.current.firstElementChild?.offsetWidth || 0) + 12;
                    carouselRef.current.scrollTo({ left: i * w, behavior: reducedMotion ? 'auto' : 'smooth' });
                  }
                }}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>}
        {trailers.length > 0 && <p className="ts-hint relative z-10">{carouselPaused ? 'Auto-scroll paused' : 'Click any trailer to browse'} • Auto-scrolling</p>}
      </div>
    </section>
  );
};

export default NativeTrailerSection;
