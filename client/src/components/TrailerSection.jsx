import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Star, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { fetchLatestTrailers } from '../services/tmdb';
import Loading from './Loading';
import BlurCircle from './BlurCircle';
const CARD_SLIDE_INTERVAL = 4000; // Auto-slide thumbnails every 4s

const TrailerSection = () => {
  const [trailers, setTrailers]         = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading]       = useState(true);
  const [hasError, setHasError]         = useState(false);
  const [isMuted, setIsMuted]           = useState(true);
  const [isPaused, setIsPaused]         = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Carousel state
  const [activeIndex, setActiveIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);

  const iframeRef = useRef(null);
  const carouselRef = useRef(null);
  const styleRef  = useRef(false);

  const currentTrailer = trailers[currentIndex] || null;

  // Send commands to YouTube iframe via postMessage
  const ytCmd = useCallback((func) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: '' }),
      '*'
    );
  }, []);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    ytCmd(next ? 'mute' : 'unMute');
  };

  const togglePause = () => {
    const next = !isPaused;
    setIsPaused(next);
    ytCmd(next ? 'pauseVideo' : 'playVideo');
  };

  // Build YouTube embed URL
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

  // Switch main player to a specific trailer
  const switchTrailer = useCallback((index) => {
    if (isTransitioning || index === currentIndex || trailers.length === 0) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex(index);
      setIsMuted(true);
      setIsPaused(false);
    }, 300);
    setTimeout(() => setIsTransitioning(false), 700);
  }, [isTransitioning, currentIndex, trailers.length]);

  const goNext = useCallback(() => {
    if (trailers.length === 0) return;
    switchTrailer((currentIndex + 1) % trailers.length);
  }, [currentIndex, trailers.length, switchTrailer]);

  const goPrev = useCallback(() => {
    if (trailers.length === 0) return;
    switchTrailer((currentIndex - 1 + trailers.length) % trailers.length);
  }, [currentIndex, trailers.length, switchTrailer]);

  // Auto-slide carousel smoothly
  useEffect(() => {
    if (trailers.length === 0 || carouselPaused) return;
    const id = setInterval(() => {
      if (carouselRef.current) {
        const container = carouselRef.current;
        const cardWidth = container.firstElementChild?.offsetWidth + 12 || 0;
        const isEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 10;
        
        if (isEnd) {
          container.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          container.scrollBy({ left: cardWidth, behavior: 'smooth' });
        }
      }
    }, CARD_SLIDE_INTERVAL);
    return () => clearInterval(id);
  }, [trailers.length, carouselPaused]);

  // Handle carousel scroll to update active dot
  const handleScroll = () => {
    if (!carouselRef.current) return;
    const cardWidth = carouselRef.current.firstElementChild?.offsetWidth + 12 || 1;
    const scrollPos = carouselRef.current.scrollLeft;
    const newIndex = Math.round(scrollPos / cardWidth);
    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex);
    }
  };

  // Carousel nav buttons
  const slideCarouselNext = () => {
    if (carouselRef.current) {
      const cardWidth = carouselRef.current.firstElementChild?.offsetWidth + 12 || 0;
      carouselRef.current.scrollBy({ left: cardWidth, behavior: 'smooth' });
    }
  };
  const slideCarouselPrev = () => {
    if (carouselRef.current) {
      const cardWidth = carouselRef.current.firstElementChild?.offsetWidth + 12 || 0;
      carouselRef.current.scrollBy({ left: -cardWidth, behavior: 'smooth' });
    }
  };

  // Inject styles once
  useEffect(() => {
    if (styleRef.current) return;
    styleRef.current = true;

    const s = document.createElement('style');
    s.textContent = `
      /* ─── Player ─── */
      .ts-player-wrap {
        position: relative;
        width: 100%;
        max-width: 960px;
        margin: 0 auto;
      }

      .ts-player {
        position: relative;
        width: 100%;
        padding-top: 56.25%; /* 16:9 */
        border-radius: 20px;
        overflow: hidden;
        background: #0a0c14;
        box-shadow:
          0 25px 60px rgba(0,0,0,0.6),
          0 0 0 1px rgba(255,255,255,0.06),
          inset 0 1px 0 rgba(255,255,255,0.05);
      }

      .ts-player iframe {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        border: none;
        pointer-events: none;
      }

      /* Fade transition overlay */
      .ts-fade-overlay {
        position: absolute;
        inset: 0;
        background: #0a0c14;
        z-index: 15;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.35s ease;
      }
      .ts-fade-overlay.active { opacity: 1; }

      /* Bottom gradient */
      .ts-player::after {
        content: '';
        position: absolute;
        bottom: 0; left: 0; right: 0;
        height: 35%;
        background: linear-gradient(to top, rgba(10,12,20,0.7) 0%, transparent 100%);
        z-index: 5;
        pointer-events: none;
        border-radius: 0 0 20px 20px;
      }

      /* Center play/pause button */
      .ts-center-btn {
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        z-index: 20;
        width: 68px; height: 68px;
        border-radius: 50%;
        background: rgba(0,0,0,0.45);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 2px solid rgba(255,255,255,0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        opacity: 0;
      }
      .ts-player:hover .ts-center-btn { opacity: 1; }
      .ts-center-btn:hover {
        background: rgba(248,69,101,0.6);
        border-color: rgba(248,69,101,0.8);
        transform: translate(-50%, -50%) scale(1.1);
        box-shadow: 0 0 30px rgba(248,69,101,0.4);
      }
      .ts-center-btn:active { transform: translate(-50%, -50%) scale(0.95); }

      /* Mute button */
      .ts-mute-btn {
        position: absolute;
        bottom: 16px; right: 16px;
        z-index: 20;
        width: 40px; height: 40px;
        border-radius: 50%;
        background: rgba(0,0,0,0.5);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.25s ease;
        color: #fff;
      }
      .ts-mute-btn:hover {
        background: rgba(255,255,255,0.15);
        border-color: rgba(255,255,255,0.3);
      }
      .ts-mute-btn.is-muted { color: #F84565; border-color: rgba(248,69,101,0.4); }

      /* ─── Info Bar ─── */
      .ts-info {
        max-width: 960px;
        margin: 20px auto 0;
        padding: 0 0.5rem;
      }
      .ts-info-title {
        font-size: 1.5rem;
        font-weight: 700;
        color: #fff;
        margin: 0 0 6px;
        line-height: 1.3;
      }
      .ts-info-movie {
        font-size: 0.9rem;
        color: #9ca3af;
        margin-bottom: 8px;
      }
      .ts-info-movie span { color: #F84565; font-weight: 600; }

      .ts-badges {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .ts-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 12px;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.3px;
      }
      .ts-badge-rating {
        background: rgba(250,204,21,0.15);
        color: #facc15;
        border: 1px solid rgba(250,204,21,0.25);
      }
      .ts-badge-official {
        background: rgba(248,69,101,0.15);
        color: #F84565;
        border: 1px solid rgba(248,69,101,0.3);
      }
      .ts-badge-year {
        background: rgba(255,255,255,0.08);
        color: #d1d5db;
        border: 1px solid rgba(255,255,255,0.12);
      }
      .ts-badge-quality {
        background: rgba(255,255,255,0.08);
        color: #d1d5db;
        border: 1px solid rgba(255,255,255,0.12);
      }

      /* ─── Navigation arrows ─── */
      .ts-nav-btn {
        width: 44px; height: 44px;
        border-radius: 50%;
        background: rgba(255,255,255,0.06);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255,255,255,0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #d1d5db;
        transition: all 0.25s ease;
        flex-shrink: 0;
      }
      .ts-nav-btn:hover {
        background: rgba(248,69,101,0.2);
        border-color: rgba(248,69,101,0.4);
        color: #fff;
        transform: scale(1.08);
      }
      .ts-nav-btn:active { transform: scale(0.95); }

      /* ─── Sliding Carousel ─── */
      .ts-carousel-wrap {
        position: relative;
        max-width: 960px;
        margin: 28px auto 0;
      }

      .ts-carousel-inner {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .ts-carousel-track {
        display: flex;
        gap: 12px;
        overflow-x: auto;
        flex: 1;
        scroll-behavior: smooth;
        scrollbar-width: none; /* Firefox */
        scroll-snap-type: x mandatory;
        padding-bottom: 8px;
      }
      .ts-carousel-track::-webkit-scrollbar {
        display: none; /* Safari and Chrome */
      }

      .ts-card {
        flex: 0 0 calc(20% - 9.6px); /* 5 cards on desktop */
        min-width: 0;
        cursor: pointer;
        border-radius: 14px;
        overflow: hidden;
        background: rgba(15,17,28,0.9);
        border: 1.5px solid rgba(255,255,255,0.06);
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        scroll-snap-align: start;
      }
      .ts-card:hover {
        transform: translateY(-4px);
        border-color: rgba(248,69,101,0.5);
        box-shadow: 0 12px 28px rgba(0,0,0,0.4), 0 0 0 1px rgba(248,69,101,0.15);
      }
      .ts-card.active {
        border-color: rgba(248,69,101,0.8);
        box-shadow: 0 0 20px rgba(248,69,101,0.2), 0 8px 24px rgba(0,0,0,0.5);
      }

      .ts-card-thumb {
        position: relative;
        width: 100%;
        aspect-ratio: 16/9;
        overflow: hidden;
      }
      .ts-card-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition: transform 0.5s ease;
      }
      .ts-card:hover .ts-card-thumb img { transform: scale(1.08); }

      /* Play icon overlay */
      .ts-card-play {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.3);
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      .ts-card:hover .ts-card-play { opacity: 1; }
      .ts-card-play-icon {
        width: 32px; height: 32px;
        border-radius: 50%;
        background: rgba(248,69,101,0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid rgba(255,255,255,0.3);
        transition: transform 0.25s ease;
      }
      .ts-card:hover .ts-card-play-icon { transform: scale(1.1); }

      /* Card rating */
      .ts-card-rating {
        position: absolute;
        top: 6px; left: 6px;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(6px);
        padding: 2px 7px;
        border-radius: 6px;
        font-size: 0.65rem;
        font-weight: 700;
        color: #facc15;
        display: flex;
        align-items: center;
        gap: 3px;
        z-index: 5;
      }

      .ts-card-meta {
        padding: 8px 10px;
      }
      .ts-card-title {
        color: #fff;
        font-weight: 600;
        font-size: 0.8rem;
        line-height: 1.35;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ts-card-sub {
        color: #6b7280;
        font-size: 0.7rem;
        margin-top: 2px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      /* Active indicator glow under active card */
      .ts-card.active::after {
        content: '';
        position: absolute;
        bottom: 0; left: 10%; right: 10%;
        height: 2px;
        background: linear-gradient(90deg, transparent, #F84565, transparent);
        border-radius: 2px;
      }

      /* ─── Dot indicators ─── */
      .ts-dots {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 16px;
      }
      .ts-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: rgba(255,255,255,0.2);
        border: none;
        cursor: pointer;
        transition: all 0.3s ease;
        padding: 0;
      }
      .ts-dot:hover {
        background: rgba(255,255,255,0.4);
      }
      .ts-dot.active {
        width: 24px;
        border-radius: 9999px;
        background: #F84565;
      }



      /* ─── Scroll hint ─── */
      .ts-scroll-hint {
        max-width: 960px;
        margin: 8px auto 0;
        text-align: center;
        font-size: 0.72rem;
        color: #4b5563;
        letter-spacing: 0.5px;
      }

      /* ─── Responsive ─── */
      @media (max-width: 768px) {
        .ts-player { border-radius: 14px; }
        .ts-player::after { border-radius: 0 0 14px 14px; }
        .ts-center-btn { width: 52px; height: 52px; }
        .ts-mute-btn { width: 34px; height: 34px; bottom: 10px; right: 10px; }
        .ts-nav-btn { width: 36px; height: 36px; }
        .ts-carousel-track { gap: 8px; }
        .ts-card { flex: 0 0 calc(33.333% - 5.33px); } /* 3 cards on tablet */
      }

      @media (max-width: 480px) {
        .ts-card-meta { padding: 6px 8px; }
        .ts-card-title { font-size: 0.72rem; }
        .ts-card-sub { font-size: 0.62rem; }
        .ts-carousel-track { gap: 6px; }
        .ts-card { flex: 0 0 calc(50% - 3px); } /* 2 cards on mobile */
      }
    `;
    document.head.appendChild(s);
  }, []);

  // Load trailers
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchLatestTrailers({ limit: 10, ttlHours: 2, pagesToSearch: 4 });
        if (!mounted) return;
        setTrailers(data);
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
  }, []);

  if (isLoading) {
    return (
      <div className="px-6 md:px-16 lg:px-24 py-20">
        <Loading />
      </div>
    );
  }

  if (hasError || trailers.length === 0) {
    return null;
  }

  return (
    
    <section className="px-6 md:px-16 lg:px-24 py-16 md:py-20 relative overflow-hidden">
      <BlurCircle top='80px' right='-60px' delay="0.5s" />
      <BlurCircle top='600px' left='-65px' delay="1s" />
      <BlurCircle top='800px' right='-100px' delay="1.5s" />
      <BlurCircle top='0px' left='0' delay="2s" />

      {/* Section Header */}
      <div className="flex items-end justify-between max-w-[960px] mx-auto mb-8 relative z-10">
        <div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-wide">Trailers</h2>
          
        </div>
        <div className="flex items-center gap-3">
          <button className="ts-nav-btn" onClick={goPrev} aria-label="Previous trailer">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button className="ts-nav-btn" onClick={goNext} aria-label="Next trailer">
            <ChevronRight className="w-5 h-5" />
          </button>
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
              {isPaused
                ? <Play className="w-7 h-7 text-white ml-1" />
                : <Pause className="w-6 h-6 text-white" />
              }
            </button>
          )}

          {currentTrailer && (
            <button className={`ts-mute-btn ${isMuted ? 'is-muted' : ''}`} onClick={toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted
                ? <VolumeX className="w-4.5 h-4.5" />
                : <Volume2 className="w-4.5 h-4.5" />
              }
            </button>
          )}
        </div>
      </div>

      {/* Info Bar */}
      {currentTrailer && (
        <div className="ts-info">
          <h3 className="ts-info-title">{currentTrailer.videoName || 'Official Trailer'}</h3>
          <p className="ts-info-movie">
            From: <span>{currentTrailer.title}</span>
          </p>
          <div className="ts-badges">
            {currentTrailer.vote_average && (
              <span className="ts-badge ts-badge-rating">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                {Number(currentTrailer.vote_average).toFixed(1)}
              </span>
            )}
            <span className="ts-badge ts-badge-official">Official</span>
            <span className="ts-badge ts-badge-year">
              {currentTrailer.release_date?.substring(0, 4) || 'N/A'}
            </span>
            <span className="ts-badge ts-badge-quality">
              {currentTrailer.qualityLabel || 'HD'}
            </span>
          </div>
        </div>
      )}

      {/* Sliding Thumbnail Carousel */}
      <div
        className="ts-carousel-wrap relative z-10"
        onMouseEnter={() => setCarouselPaused(true)}
        onMouseLeave={() => setCarouselPaused(false)}
      >
        <div className="ts-carousel-inner">
          {/* Left arrow */}
          <button
            className="ts-nav-btn hidden md:flex"
            onClick={slideCarouselPrev}
            aria-label="Previous thumbnails"
          >
            <ChevronLeft className="w-4.5 h-4.5" />
          </button>

          {/* Cards */}
          <div 
            className="ts-carousel-track" 
            ref={carouselRef}
            onScroll={handleScroll}
          >
            {trailers.map((t, realIdx) => {
              return (
                <button
                  key={t.id}
                  className={`ts-card ${currentIndex === realIdx ? 'active' : ''}`}
                  onClick={() => switchTrailer(realIdx)}
                >
                  <div className="ts-card-thumb">
                    <img
                      src={t.thumbnail || t.backdrop_path || t.poster_path}
                      alt={t.title}
                      loading="lazy"
                    />
                    <div className="ts-card-play">
                      <div className="ts-card-play-icon">
                        <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
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
              );
            })}
          </div>

          {/* Right arrow */}
          <button
            className="ts-nav-btn hidden md:flex"
            onClick={slideCarouselNext}
            aria-label="Next thumbnails"
          >
            <ChevronRight className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Dot indicators */}
        <div className="ts-dots">
          {trailers.map((_, i) => (
            <button
              key={i}
              className={`ts-dot ${activeIndex === i ? 'active' : ''}`}
              onClick={() => {
                if (carouselRef.current) {
                  const cardWidth = carouselRef.current.firstElementChild?.offsetWidth + 12 || 0;
                  carouselRef.current.scrollTo({ left: i * cardWidth, behavior: 'smooth' });
                }
              }}
              aria-label={`Go to slide ${i+1}`}
            />
          ))}
        </div>
      </div>

      {/* Hint */}
      <p className="ts-scroll-hint relative z-10">
        {carouselPaused ? 'Auto-scroll paused' : 'Click any trailer or navigation to browse • Auto-scrolling'}
      </p>
    </section>
  );
};

export default TrailerSection;