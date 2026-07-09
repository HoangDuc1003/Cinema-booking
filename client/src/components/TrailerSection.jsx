import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Star, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { fetchLatestTrailers, fetchMovieTrailers } from '../services/tmdb';
import Loading from './Loading';
import BlurCircle from './BlurCircle';

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

/* ─────────────────────────────────────────
   CINEMA PLAYER — used in MovieDetail (movieOnly)
   Clean, full-width, no carousel
───────────────────────────────────────── */
const CinemaPlayer = ({ trailers, movieTitle }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const styleRef = useRef(false);

  const current = trailers[currentIndex] || null;

  const buildEmbedUrl = (trailer) => {
    if (!trailer?.embedUrl && !trailer?.videoUrl) return '';
    try {
      const url = new URL(trailer.embedUrl || trailer.videoUrl);
      url.searchParams.set('autoplay', '1');
      url.searchParams.set('mute', '0');
      url.searchParams.set('enablejsapi', '1');
      url.searchParams.set('rel', '0');
      url.searchParams.set('modestbranding', '1');
      url.searchParams.set('controls', '1');
      url.searchParams.set('iv_load_policy', '3');
      return url.toString();
    } catch {
      return trailer.embedUrl || trailer.videoUrl;
    }
  };

  const switchTo = useCallback((index) => {
    if (isTransitioning || index === currentIndex) return;
    setIsTransitioning(true);
    setTimeout(() => { setCurrentIndex(index); }, 280);
    setTimeout(() => setIsTransitioning(false), 620);
  }, [isTransitioning, currentIndex]);

  const goNext = () => switchTo((currentIndex + 1) % trailers.length);
  const goPrev = () => switchTo((currentIndex - 1 + trailers.length) % trailers.length);

  // Inject cinema player styles once
  useEffect(() => {
    if (styleRef.current) return;
    styleRef.current = true;
    const s = document.createElement('style');
    s.textContent = `
      /* ── CinemaPlayer wrap ── */
      .cp-wrap { position: relative; width: 100%; background: transparent; }

      /* Flex row: player left, sidebar right — sidebar stretches to match player height */
      .cp-layout {
        display: flex;
        gap: 12px;
        align-items: stretch;
      }
      .cp-left {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      /* Player keeps 16:9 and fills full height of left column */
      .cp-player {
        position: relative;
        width: 100%;
        padding-top: 56.25%;
        overflow: hidden;
        background: #000;
        flex: 1;
      }
      .cp-player iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: none; }
      .cp-fade { position: absolute; inset: 0; background: #000; z-index: 10; pointer-events: none; opacity: 0; transition: opacity 0.3s ease; }
      .cp-fade.on { opacity: 1; }

      /* Sidebar — exactly as tall as .cp-left (which = player height) */
      .cp-sidebar {
        width: 220px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
        overflow-y: auto;
        overflow-x: hidden;
        scrollbar-width: thin;
        scrollbar-color: rgba(248,69,101,0.35) transparent;
        /* height will be determined by flex-stretch from parent */
      }
      .cp-sidebar::-webkit-scrollbar { width: 4px; }
      .cp-sidebar::-webkit-scrollbar-track { background: transparent; }
      .cp-sidebar::-webkit-scrollbar-thumb { background: rgba(248,69,101,0.35); border-radius: 4px; }

      /* Each sidebar card — style mirrors ts-card from Home TrailerSection */
      .cp-card {
        flex-shrink: 0;
        cursor: pointer;
        border-radius: 10px;
        overflow: hidden;
        background: rgba(15,17,28,0.9);
        border: 1.5px solid rgba(255,255,255,0.06);
        transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
        position: relative;
        text-align: left;
        width: 100%;
      }
      .cp-card:hover {
        border-color: rgba(248,69,101,0.5);
        box-shadow: 0 8px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(248,69,101,0.12);
        transform: translateX(-2px);
      }
      .cp-card.active {
        border-color: rgba(248,69,101,0.8);
        box-shadow: 0 0 16px rgba(248,69,101,0.2), 0 6px 18px rgba(0,0,0,0.5);
      }
      .cp-card.active::after {
        content: '';
        position: absolute;
        left: 0; top: 10%; bottom: 10%;
        width: 2px;
        background: linear-gradient(180deg, transparent, #F84565, transparent);
        border-radius: 2px;
      }
      .cp-card-thumb {
        position: relative;
        width: 100%;
        aspect-ratio: 16/9;
        overflow: hidden;
        background: #0d0f1a;
      }
      .cp-card-thumb img {
        width: 100%; height: 100%;
        object-fit: cover;
        display: block;
        transition: transform 0.4s ease;
      }
      .cp-card:hover .cp-card-thumb img { transform: scale(1.06); }
      .cp-card-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.28);
        opacity: 0;
        transition: opacity 0.25s ease;
      }
      .cp-card:hover .cp-card-overlay { opacity: 1; }
      .cp-card-play-icon {
        width: 28px; height: 28px;
        border-radius: 50%;
        background: rgba(248,69,101,0.85);
        display: flex; align-items: center; justify-content: center;
        border: 2px solid rgba(255,255,255,0.3);
      }
      .cp-card-meta { padding: 6px 8px 7px; }
      .cp-card-title {
        color: #f3f4f6;
        font-weight: 600;
        font-size: 0.74rem;
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-bottom: 2px;
      }
      .cp-card-sub {
        color: #6b7280;
        font-size: 0.64rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .cp-card-num {
        position: absolute;
        top: 5px; left: 5px;
        background: rgba(0,0,0,0.65);
        backdrop-filter: blur(5px);
        padding: 1px 6px;
        border-radius: 5px;
        font-size: 0.6rem;
        font-weight: 700;
        color: #d1d5db;
        z-index: 5;
      }

      /* Controls bar below player */
      .cp-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 0 0;
        gap: 10px;
      }
      .cp-ctrl-group { display: flex; align-items: center; gap: 7px; }
      .cp-btn {
        display: flex; align-items: center; justify-content: center;
        width: 34px; height: 34px;
        border-radius: 50%;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        cursor: pointer;
        color: #d1d5db;
        transition: all 0.2s ease;
      }
      .cp-btn:hover { background: rgba(248,69,101,0.2); border-color: rgba(248,69,101,0.4); color: #fff; }
      .cp-title-line {
        font-size: 0.84rem; font-weight: 600; color: #e5e7eb;
        flex: 1; text-align: center;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        padding: 0 6px;
      }
      .cp-count { font-size: 0.7rem; color: #6b7280; white-space: nowrap; }

      /* Mobile: hide sidebar, show horizontal scroll below */
      .cp-mobile-tabs {
        display: flex;
        gap: 8px;
        padding-top: 10px;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .cp-mobile-tabs::-webkit-scrollbar { display: none; }
      .cp-mobile-card {
        flex-shrink: 0;
        width: 140px;
        border-radius: 9px;
        overflow: hidden;
        background: rgba(15,17,28,0.9);
        border: 1.5px solid rgba(255,255,255,0.06);
        transition: all 0.25s ease;
        cursor: pointer;
        text-align: left;
      }
      .cp-mobile-card.active { border-color: rgba(248,69,101,0.8); }
      .cp-mobile-card-thumb { width: 100%; aspect-ratio: 16/9; overflow: hidden; background: #0d0f1a; }
      .cp-mobile-card-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .cp-mobile-card-title {
        padding: 5px 7px;
        font-size: 0.7rem; font-weight: 600; color: #e5e7eb;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
    `;
    document.head.appendChild(s);
  }, []);

  if (!current) return null;
  const hasMultiple = trailers.length > 1;

  return (
    <div className="cp-wrap">
      {/* ── Desktop layout: player + sidebar (same height) ── */}
      <div className="cp-layout">
        {/* Left: player + controls */}
        <div className="cp-left">
          <div className="cp-player">
            <div className={`cp-fade ${isTransitioning ? 'on' : ''}`} />
            <iframe
              key={`cp-${current.id || currentIndex}`}
              src={buildEmbedUrl(current)}
              title={current.videoName || current.title || 'Trailer'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>

          {hasMultiple && (
            <div className="cp-controls">
              <div className="cp-ctrl-group">
                <button className="cp-btn" onClick={goPrev} aria-label="Previous"><ChevronLeft className="w-4 h-4" /></button>
                <button className="cp-btn" onClick={goNext} aria-label="Next"><ChevronRight className="w-4 h-4" /></button>
              </div>
              <span className="cp-title-line">{current.videoName || 'Official Trailer'}</span>
              <span className="cp-count">{currentIndex + 1} / {trailers.length}</span>
            </div>
          )}
        </div>

        {/* Right: sidebar — height stretches to match player (flex-stretch) */}
        {hasMultiple && (
          <div className="cp-sidebar hidden md:flex">
            {trailers.map((t, i) => (
              <button
                key={t.id || i}
                className={`cp-card ${i === currentIndex ? 'active' : ''}`}
                onClick={() => switchTo(i)}
              >
                <div className="cp-card-thumb">
                  <img src={t.thumbnail || t.backdrop_path || t.poster_path} alt={t.title} loading="lazy" />
                  <div className="cp-card-overlay">
                    <div className="cp-card-play-icon">
                      <Play className="w-3 h-3 text-white fill-white ml-0.5" />
                    </div>
                  </div>
                  <span className="cp-card-num">{i + 1}</span>
                </div>
                <div className="cp-card-meta">
                  <p className="cp-card-title">{t.videoName || t.title || 'Trailer'}</p>
                  <div className="cp-card-sub">
                    <span>{t.release_date?.substring(0, 4) || 'N/A'}</span>
                    <span style={{ color: t.vote_average ? '#facc15' : '#4b5563' }}>
                      {t.vote_average ? `★ ${Number(t.vote_average).toFixed(1)}` : 'HD'}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mobile: horizontal scroll tabs below */}
      {hasMultiple && (
        <div className="cp-mobile-tabs md:hidden">
          {trailers.map((t, i) => (
            <button
              key={t.id || i}
              className={`cp-mobile-card ${i === currentIndex ? 'active' : ''}`}
              onClick={() => switchTo(i)}
            >
              <div className="cp-mobile-card-thumb">
                <img src={t.thumbnail || t.backdrop_path || t.poster_path} alt={t.title} loading="lazy" />
              </div>
              <p className="cp-mobile-card-title">{t.videoName || t.title || 'Trailer'}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────── */
const TrailerSection = ({ featuredMovie = null, sectionId = 'trailers', movieOnly = false }) => {
  const [trailers, setTrailers]         = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading]       = useState(true);
  const [hasError, setHasError]         = useState(false);
  const [isMuted, setIsMuted]           = useState(true);
  const [isPaused, setIsPaused]         = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [carouselPaused, setCarouselPaused]   = useState(false);
  const [activeIndex, setActiveIndex]         = useState(0);

  const iframeRef   = useRef(null);
  const carouselRef = useRef(null);
  const styleRef    = useRef(false);

  const currentTrailer = trailers[currentIndex] || null;

  const ytCmd = useCallback((func) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: '' }),
      '*'
    );
  }, []);

  const toggleMute  = () => { const n = !isMuted;  setIsMuted(n);  ytCmd(n ? 'mute' : 'unMute'); };
  const togglePause = () => { const n = !isPaused; setIsPaused(n); ytCmd(n ? 'pauseVideo' : 'playVideo'); };

  const buildEmbedUrl = (trailer) => {
    if (!trailer?.embedUrl && !trailer?.videoUrl) return '';
    try {
      const url = new URL(trailer.embedUrl || trailer.videoUrl);
      url.searchParams.set('autoplay', '1');
      url.searchParams.set('mute', '1');
      url.searchParams.set('enablejsapi', '1');
      url.searchParams.set('rel', '0');
      url.searchParams.set('modestbranding', '1');
      url.searchParams.set('controls', '0');
      url.searchParams.set('iv_load_policy', '3');
      url.searchParams.set('showinfo', '0');
      return url.toString();
    } catch {
      return trailer.embedUrl || trailer.videoUrl;
    }
  };

  const switchTrailer = useCallback((index) => {
    if (isTransitioning || index === currentIndex || !trailers.length) return;
    setIsTransitioning(true);
    setTimeout(() => { setCurrentIndex(index); setIsMuted(true); setIsPaused(false); }, 300);
    setTimeout(() => setIsTransitioning(false), 700);
  }, [isTransitioning, currentIndex, trailers.length]);

  const goNext = useCallback(() => { if (trailers.length) switchTrailer((currentIndex + 1) % trailers.length); }, [currentIndex, trailers.length, switchTrailer]);
  const goPrev = useCallback(() => { if (trailers.length) switchTrailer((currentIndex - 1 + trailers.length) % trailers.length); }, [currentIndex, trailers.length, switchTrailer]);

  // Auto-slide carousel (home mode)
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

  // Inject HOME styles once
  useEffect(() => {
    if (styleRef.current) return;
    styleRef.current = true;
    const s = document.createElement('style');
    s.textContent = `
      .ts-player-wrap { position:relative; width:100%; max-width:1248px; margin:0 auto; }
      .ts-player { position:relative; width:100%; padding-top:56.25%; border-radius:0; overflow:hidden; background:transparent; box-shadow:none; }
      .ts-player iframe { position:absolute; top:0; left:0; width:100%; height:100%; border:none; pointer-events:none; }
      .ts-fade-overlay { position:absolute; inset:0; background:#07070a; z-index:15; pointer-events:none; opacity:0; transition:opacity 0.35s ease; }
      .ts-fade-overlay.active { opacity:1; }
      .ts-player::after { content:''; position:absolute; bottom:0; left:0; right:0; height:30%; background:linear-gradient(to top,rgba(10,12,20,0.75) 0%,transparent 100%); z-index:5; pointer-events:none; }
      .ts-center-btn { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); z-index:20; width:64px; height:64px; border-radius:50%; background:rgba(0,0,0,0.4); backdrop-filter:blur(12px); border:2px solid rgba(255,255,255,0.18); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.3s cubic-bezier(0.4,0,0.2,1); opacity:0; }
      .ts-player:hover .ts-center-btn { opacity:1; }
      .ts-center-btn:hover { background:rgba(248,69,101,0.55); border-color:rgba(248,69,101,0.8); transform:translate(-50%,-50%) scale(1.1); box-shadow:0 0 28px rgba(248,69,101,0.4); }
      .ts-mute-btn { position:absolute; bottom:14px; right:14px; z-index:20; width:38px; height:38px; border-radius:50%; background:rgba(0,0,0,0.5); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.15); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.25s ease; color:#fff; }
      .ts-mute-btn:hover { background:rgba(255,255,255,0.15); }
      .ts-mute-btn.is-muted { color:#F84565; border-color:rgba(248,69,101,0.4); }
      .ts-info { max-width:1248px; margin:18px auto 0; padding:0 0.5rem; }
      .ts-info-title { font-size:1.4rem; font-weight:700; color:#fff; margin:0 0 5px; line-height:1.3; }
      .ts-info-movie { font-size:0.85rem; color:#9ca3af; margin-bottom:8px; }
      .ts-info-movie span { color:#F84565; font-weight:600; }
      .ts-badges { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .ts-badge { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:9999px; font-size:0.72rem; font-weight:600; letter-spacing:0.3px; }
      .ts-badge-rating { background:rgba(250,204,21,0.15); color:#facc15; border:1px solid rgba(250,204,21,0.25); }
      .ts-badge-official { background:rgba(248,69,101,0.15); color:#F84565; border:1px solid rgba(248,69,101,0.3); }
      .ts-badge-year { background:rgba(255,255,255,0.08); color:#d1d5db; border:1px solid rgba(255,255,255,0.12); }
      .ts-badge-quality { background:rgba(255,255,255,0.08); color:#d1d5db; border:1px solid rgba(255,255,255,0.12); }
      .ts-nav-btn { width:42px; height:42px; border-radius:50%; background:rgba(255,255,255,0.06); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; cursor:pointer; color:#d1d5db; transition:all 0.25s ease; flex-shrink:0; }
      .ts-nav-btn:hover { background:rgba(248,69,101,0.2); border-color:rgba(248,69,101,0.4); color:#fff; transform:scale(1.08); }
      .ts-carousel-wrap { position:relative; width:min(96vw,1500px); max-width:min(96vw,1500px); margin:24px auto 0; left:50%; transform:translateX(-50%); }
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
      .ts-hint { max-width:min(96vw,1500px); margin:8px auto 0; text-align:center; font-size:0.72rem; color:#4b5563; letter-spacing:0.5px; }
      @media (max-width:768px) {
        .ts-player { border-radius:0; }
        .ts-center-btn { width:50px; height:50px; }
        .ts-mute-btn { width:32px; height:32px; bottom:9px; right:9px; }
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

  // Load trailers — home mode
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

  // Load trailers — featuredMovie
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

  /* ── MOVIE-ONLY MODE ── */
  if (movieOnly) {
    if (isLoading) {
      return (
        <section id={sectionId} className="relative py-10">
          <div className="flex items-center justify-center py-16">
            <Loading />
          </div>
        </section>
      );
    }
    if (hasError || trailers.length === 0) return null;

    return (
      <section
        id={sectionId}
        className="scroll-mt-20 relative overflow-hidden"
        style={{ background: 'transparent', marginTop: 20 }}
      >
        <CinemaPlayer trailers={trailers} movieTitle={featuredMovie?.title || featuredMovie?.name || ''} />
      </section>
    );
  }

  /* ── HOME MODE ── */
  if (isLoading) return <div className="px-6 md:px-16 lg:px-24 py-20"><Loading /></div>;
  if (hasError || trailers.length === 0) return null;

  return (
    <section id={sectionId} className="scroll-mt-20 px-6 md:px-16 lg:px-24 py-16 md:py-20 relative overflow-hidden min-h-screen md:min-h-[80vh]">
      <BlurCircle top='80px' right='-60px' delay="0.5s" />
      <BlurCircle top='600px' left='-65px' delay="1s" />
      <BlurCircle top='800px' right='-100px' delay="1.5s" />
      <BlurCircle top='0px' left='0' delay="2s" />

      {/* Header */}
      <div className="flex items-end justify-between max-w-[1248px] mx-auto mb-8 relative z-10">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-wide">Trailers</h2>
        <div className="flex items-center gap-3">
          <button className="ts-nav-btn" onClick={goPrev} aria-label="Previous trailer"><ChevronLeft className="w-5 h-5" /></button>
          <button className="ts-nav-btn" onClick={goNext} aria-label="Next trailer"><ChevronRight className="w-5 h-5" /></button>
        </div>
      </div>

      {/* Main Player */}
      <div className="ts-player-wrap relative z-10">
        <div className="ts-player">
          <div className={`ts-fade-overlay ${isTransitioning ? 'active' : ''}`} />
          {currentTrailer && (
            <iframe
              ref={iframeRef}
              key={currentTrailer.id}
              src={buildEmbedUrl(currentTrailer)}
              title={currentTrailer.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
          {currentTrailer && (
            <button className="ts-center-btn" onClick={togglePause} aria-label={isPaused ? 'Play' : 'Pause'}>
              {isPaused ? <Play className="w-6 h-6 text-white ml-1" /> : <Pause className="w-5 h-5 text-white" />}
            </button>
          )}
          {currentTrailer && (
            <button className={`ts-mute-btn ${isMuted ? 'is-muted' : ''}`} onClick={toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Info Bar */}
      {currentTrailer && (
        <div className="ts-info">
          <h3 className="ts-info-title">{currentTrailer.videoName || 'Official Trailer'}</h3>
          <p className="ts-info-movie">From: <span>{currentTrailer.title}</span></p>
          <div className="ts-badges">
            {currentTrailer.vote_average && (
              <span className="ts-badge ts-badge-rating">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                {Number(currentTrailer.vote_average).toFixed(1)}
              </span>
            )}
            <span className="ts-badge ts-badge-official">Official</span>
            <span className="ts-badge ts-badge-year">{currentTrailer.release_date?.substring(0, 4) || 'N/A'}</span>
            <span className="ts-badge ts-badge-quality">{currentTrailer.qualityLabel || 'HD'}</span>
          </div>
        </div>
      )}

      {/* Thumbnail Carousel */}
      <div
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
                key={t.id}
                className={`ts-card ${currentIndex === i ? 'active' : ''}`}
                onClick={() => switchTrailer(i)}
              >
                <div className="ts-card-thumb">
                  <img src={t.thumbnail || t.backdrop_path || t.poster_path} alt={t.title} loading="lazy" />
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
                    <span>{t.qualityLabel || 'HD'}</span>
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
                  carouselRef.current.scrollTo({ left: i * w, behavior: 'smooth' });
                }
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      </div>

      <p className="ts-hint relative z-10">
        {carouselPaused ? 'Auto-scroll paused' : 'Click any trailer to browse • Auto-scrolling'}
      </p>
    </section>
  );
};

export default TrailerSection;
