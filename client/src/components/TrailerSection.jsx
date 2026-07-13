import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Star, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { fetchLatestTrailers, fetchMovieTrailers } from '../services/tmdb';
import Loading from './Loading';
import BlurCircle from './BlurCircle';
import CinematicTrailerPlayer from './CinematicTrailerPlayer';

const CARD_SLIDE_INTERVAL = 4000;

const getTrailerKey = (trailer) => trailer?.videoUrl || trailer?.embedUrl || trailer?.id;

const mergeTrailerLists = (...lists) => {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    for (const trailer of list || []) {
      const key = getTrailerKey(trailer);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(trailer);
    }
  }
  return merged;
};

const extractVideoId = (url) => {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtube.com')) {
      return urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop();
    }
    if (urlObj.hostname.includes('youtu.be')) {
      return urlObj.pathname.substring(1);
    }
    return url;
  } catch {
    return url;
  }
};

const TrailerSection = ({ featuredMovie = null, sectionId = 'trailers', movieOnly = false }) => {
  const [trailers, setTrailers]         = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading]       = useState(true);
  const [hasError, setHasError]         = useState(false);
  const [carouselPaused, setCarouselPaused]   = useState(false);
  const [activeIndex, setActiveIndex]         = useState(0);

  const carouselRef = useRef(null);
  const styleRef    = useRef(false);

  const currentTrailer = trailers[currentIndex] || null;

  const switchTrailer = useCallback((index) => {
    if (index === currentIndex || !trailers.length) return;
    setCurrentIndex(index);
  }, [currentIndex, trailers.length]);

  const goNext = useCallback(() => { if (trailers.length) switchTrailer((currentIndex + 1) % trailers.length); }, [currentIndex, trailers.length, switchTrailer]);
  const goPrev = useCallback(() => { if (trailers.length) switchTrailer((currentIndex - 1 + trailers.length) % trailers.length); }, [currentIndex, trailers.length, switchTrailer]);

  useEffect(() => {
    if (trailers.length === 0 || carouselPaused) return;
    const id = setInterval(() => {
      if (!carouselRef.current) return;
      const c = carouselRef.current;
      const w = (c.firstElementChild?.offsetWidth || 0) + 12;
      const atEnd = c.scrollLeft + c.clientWidth >= c.scrollWidth - 10;
      c.scrollTo({ left: atEnd ? 0 : c.scrollLeft + w, behavior: 'smooth' });
    }, CARD_SLIDE_INTERVAL);
    return () => clearInterval(id);
  }, [trailers.length, carouselPaused]);

  const handleScroll = () => {
    if (!carouselRef.current) return;
    const w = (carouselRef.current.firstElementChild?.offsetWidth || 0) + 12 || 1;
    const i = Math.round(carouselRef.current.scrollLeft / w);
    if (i !== activeIndex) setActiveIndex(i);
  };

  const scrollCarousel = (dir) => {
    if (!carouselRef.current) return;
    const w = (carouselRef.current.firstElementChild?.offsetWidth || 0) + 12;
    carouselRef.current.scrollBy({ left: dir * w, behavior: 'smooth' });
  };

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
    `;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (movieOnly) return;
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchLatestTrailers({ limit: 10, ttlHours: 2, pagesToSearch: 4 });
        if (!mounted) return;
        setTrailers((cur) => mergeTrailerLists(cur.filter((t) => t.isRequestedTrailer), data));
        setHasError(false);
      } catch (e) {
        console.error('Failed to load trailers:', e);
        setHasError(true);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    const id = setInterval(load, 1000 * 60 * 60 * 2);
    return () => { mounted = false; clearInterval(id); };
  }, [movieOnly]);

  useEffect(() => {
    const movieId = featuredMovie?._id || featuredMovie?.id;
    if (!movieId) { if (movieOnly) Promise.resolve().then(() => setIsLoading(false)); return; }
    let mounted = true;
    const controller = new AbortController();
    const load = async () => {
      if (movieOnly) { setIsLoading(true); setTrailers([]); }
      try {
        const data = await fetchMovieTrailers(featuredMovie, { signal: controller.signal });
        if (!mounted || !data.length) return;
        setTrailers((cur) => movieOnly ? data : mergeTrailerLists(data, cur));
        setCurrentIndex(0);
        setActiveIndex(0);
        setHasError(false);
      } catch (err) {
        if (err.name !== 'AbortError') console.warn('Failed to load trailer:', err.message);
        if (movieOnly && mounted) setHasError(true);
      } finally {
        if (movieOnly && mounted) setIsLoading(false);
      }
    };
    load();
    return () => { mounted = false; controller.abort(); };
  }, [featuredMovie, movieOnly]);

  if (movieOnly) {
    if (isLoading) {
      return (
        <section id={sectionId} className="relative py-10">
          <div className="flex items-center justify-center py-16"><Loading /></div>
        </section>
      );
    }
    if (hasError || trailers.length === 0) return null;

    return (
      <section id={sectionId} className="scroll-mt-20 relative overflow-hidden" style={{ background: 'transparent', marginTop: 20 }}>
        <div className="ts-content-shell">
          {currentTrailer && (
            <CinematicTrailerPlayer
              videoId={extractVideoId(currentTrailer.embedUrl || currentTrailer.videoUrl)}
              movieTitle={currentTrailer.videoName || currentTrailer.title}
              rating={currentTrailer.vote_average}
              year={currentTrailer.release_date?.substring(0, 4)}
              qualityLabel={currentTrailer.qualityLabel}
              currentIndex={currentIndex}
              total={trailers.length}
              onNext={goNext}
              onPrevious={goPrev}
            />
          )}
        </div>
      </section>
    );
  }

  if (isLoading) return <div className="px-6 md:px-16 lg:px-24 py-20"><Loading /></div>;
  if (hasError || trailers.length === 0) return null;

  return (
    <section id={sectionId} className="scroll-mt-20 px-6 md:px-16 lg:px-24 py-16 md:py-20 relative overflow-hidden min-h-screen md:min-h-[80vh]">
      <BlurCircle top='80px' right='-60px' delay="0.5s" />
      <BlurCircle top='600px' left='-65px' delay="1s" />
      <BlurCircle top='800px' right='-100px' delay="1.5s" />
      <BlurCircle top='0px' left='0' delay="2s" />

      <div className="ts-content-shell relative z-10">
      <div className="flex items-end justify-between max-w-[1248px] mx-auto mb-8 relative z-10">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-wide">Trailers</h2>
      </div>

      {currentTrailer && (
        <div className="relative z-10 w-full">
          <CinematicTrailerPlayer
            videoId={extractVideoId(currentTrailer.embedUrl || currentTrailer.videoUrl)}
            movieTitle={currentTrailer.title}
            rating={currentTrailer.vote_average}
            year={currentTrailer.release_date?.substring(0, 4)}
            qualityLabel={currentTrailer.qualityLabel}
            currentIndex={currentIndex}
            total={trailers.length}
            onNext={goNext}
            onPrevious={goPrev}
          />
        </div>
      )}

      <div className="ts-carousel-wrap relative z-10" onMouseEnter={() => setCarouselPaused(true)} onMouseLeave={() => setCarouselPaused(false)}>
        <div className="ts-carousel-inner">
          <button className="ts-nav-btn hidden md:flex" onClick={() => scrollCarousel(-1)} aria-label="Previous thumbnails"><ChevronLeft className="w-4 h-4" /></button>
          <div className="ts-carousel-track" ref={carouselRef} onScroll={handleScroll}>
            {trailers.map((t, i) => (
              <button key={t.id || i} className={`ts-card ${currentIndex === i ? 'active' : ''}`} onClick={() => switchTrailer(i)}>
                <div className="ts-card-thumb">
                  <img src={t.thumbnail || t.backdrop_path || t.poster_path} alt={t.title} loading="lazy" />
                  <div className="ts-card-play"><div className="ts-card-play-icon"><Play className="w-3 h-3 text-white fill-white ml-0.5" /></div></div>
                  {t.vote_average && <div className="ts-card-rating"><Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />{Number(t.vote_average).toFixed(1)}</div>}
                </div>
                <div className="ts-card-meta">
                  <p className="ts-card-title">{t.title}</p>
                  <div className="ts-card-sub">
                    <span>{t.release_date?.substring(0, 4) || 'N/A'}</span>
                    <span>{t.qualityLabel || 'HD'}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <button className="ts-nav-btn hidden md:flex" onClick={() => scrollCarousel(1)} aria-label="Next thumbnails"><ChevronRight className="w-4 h-4" /></button>
        </div>

        <div className="ts-dots">
          {trailers.map((_, i) => (
            <button key={i} className={`ts-dot ${activeIndex === i ? 'active' : ''}`} onClick={() => {
              if (carouselRef.current) {
                const w = (carouselRef.current.firstElementChild?.offsetWidth || 0) + 12;
                carouselRef.current.scrollTo({ left: i * w, behavior: 'smooth' });
              }
            }} aria-label={`Go to slide ${i + 1}`} />
          ))}
        </div>
      </div>
      <p className="ts-hint relative z-10">{carouselPaused ? 'Auto-scroll paused' : 'Click any trailer to browse • Auto-scrolling'}</p>
      </div>
    </section>
  );
};

export default TrailerSection;
