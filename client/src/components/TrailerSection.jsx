import React, { useState, useEffect, useRef } from 'react';
import BlurCircle from './BlurCircle';
import { Star } from 'lucide-react';
import { fetchLatestTrailers } from '../services/tmdb';
import Loading from './Loading';

const TrailerSection = () => {
  const [trailers, setTrailers]         = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading]       = useState(true);
  const [hasError, setHasError]         = useState(false);
  const [isMuted, setIsMuted]           = useState(true);
  const [isPaused, setIsPaused]         = useState(false);

  const iframeRef = useRef(null);
  const styleRef  = useRef(false);

  const currentTrailer = trailers[currentIndex] || null;

  // Send commands to YouTube iframe via postMessage
  const ytCmd = (func) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: '' }),
      '*'
    );
  };

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

  // Build YouTube embed URL with clean parameters
  const buildEmbedUrl = (trailer) => {
    if (!trailer?.embedUrl && !trailer?.videoUrl) return '';
    try {
      const url = new URL(trailer.embedUrl || trailer.videoUrl);
      url.searchParams.set('autoplay', '1');
      url.searchParams.set('mute', '1');
      url.searchParams.set('enablejsapi', '1');
      url.searchParams.set('rel', '0');
      url.searchParams.set('modestbranding', '1');
      url.searchParams.set('controls', '0'); // Hide YouTube controls
      url.searchParams.set('iv_load_policy', '3'); // Hide video annotations
      return url.toString();
    } catch {
      return trailer.embedUrl || trailer.videoUrl;
    }
  };

  // Inject cinematic 21:9 aspect ratio styles
  useEffect(() => {
    if (styleRef.current) return;
    styleRef.current = true;

    const s = document.createElement('style');
    s.textContent = `

      .trailer-player-wrapper {
        width: 75%;
        margin: 0 auto;
      }

      .trailer-player {
        position: relative;
        width: 100%;
        padding-top: 42.85%; /* 100 / (21/9) = 42.85% */
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 20px 50px rgba(0,0,0,.45);
        background: #02050b;
      }

      /* Crop 16:9 iframe to 21:9 aspect ratio */
      .video-crop {
        position: absolute;
        top: -17.625%; /* Offset to hide 16:9 black bars */
        left: 0;
        right: 0;
        width: 100%;
        height: 131.25%; /* Scale to fill 21:9 frame */
      }

      /* iframe fills the crop container */
      .video-crop iframe {
        position: absolute !important;
        top: 0;
        left: 0;
        width: 100% !important;
        height: 100% !important;
        border: none;
        pointer-events: none; /* Block mouse interaction, use custom buttons */
      }

      /* Control buttons */
      .player-controls {
        position: absolute;
        top: 12px;
        right: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 20;
      }

      .ctrl-btn {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 6px 14px;
        border-radius: 9999px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        letter-spacing: .2px;
        transition: background .18s ease, transform .1s ease;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        pointer-events: auto; /* Ensure buttons are clickable */
      }

      .ctrl-btn:active { transform: scale(0.96); }

      .ctrl-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .ctrl-btn.is-playing { background: rgba(24,24,36,0.88); color: #e5e7eb; }
      .ctrl-btn.is-playing .ctrl-dot { background: #6b7280; }
      .ctrl-btn.is-playing:hover { background: rgba(45,45,60,0.98); }

      .ctrl-btn.is-paused { background: rgba(24,24,36,0.88); color: #e5e7eb; }
      .ctrl-btn.is-paused .ctrl-dot { background: #6b7280; }
      .ctrl-btn.is-paused:hover { background: rgba(45,45,60,0.98); }

      .ctrl-btn.is-muted { background: rgba(246,69,101,0.9); color: #fff; }
      .ctrl-btn.is-muted .ctrl-dot { background: rgba(255,255,255,.65); }
      .ctrl-btn.is-muted:hover { background: rgba(246,69,101,0.98); }

      .ctrl-btn.is-sound { background: rgba(24,24,36,0.88); color: #e5e7eb; }
      .ctrl-btn.is-sound .ctrl-dot { background: #4ade80; }
      .ctrl-btn.is-sound:hover { background: rgba(45,45,60,0.98); }

      .trailer-info {
        color: #d1d5db;
        margin-top: 18px;
        max-width: 1000px;
        margin-left: auto;
        margin-right: auto;
        padding: 0 1.5rem;
      }

      .quality-badge {
        border: 1px solid rgba(255,255,255,.25);
        border-radius: 9999px;
        padding: 2px 10px;
        font-size: 12px;
      }

      .indicator-wrap {
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: center;
        margin-top: 16px;
      }

      .indicator-btn {
        width: 10px;
        height: 10px;
        border-radius: 9999px;
        background: rgba(255,255,255,0.35);
        transition: all .25s ease;
        border: none;
        cursor: pointer;
      }

      .indicator-btn.active {
        width: 28px;
        background: rgba(246,69,101,1);
      }

      .marquee {
        overflow: hidden;
        width: 100%;
        padding: 1.5rem;
        margin-top: 1.25rem;
      }

      .marquee-track {
        display: flex;
        gap: 1rem;
        align-items: stretch;
        min-width: max-content;
      }

      .marquee-track.animate { animation: trailerMove 40s linear infinite; }
      .marquee-track.animate:hover { animation-play-state: paused; }

      @keyframes trailerMove {
        from { transform: translateX(0); }
        to   { transform: translateX(-50%); } 
      }

      .marquee-item {
        flex: 0 0 280px;
        width: 280px;
        cursor: pointer;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.12);
        background: #06080f;
        text-align: left;
        transition: all .25s ease;
        padding: 0;
      }

      .marquee-item:hover { transform: translateY(-3px); border-color: rgba(246,69,101,.7); }
      .marquee-item.active { border-color: rgba(255,255,255,0.75); box-shadow: 0 0 0 2px rgba(255,255,255,0.15) inset; }

      .thumb-image-wrap { width: 100%; height: 155px; }
      .thumb-image-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }

      .thumb-meta {
        background: linear-gradient(180deg, rgba(9,11,17,0.92), rgba(3,4,8,0.98));
        padding: .8rem .85rem;
      }

      .thumb-title { color: #fff; font-weight: 600; font-size: .98rem; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .thumb-sub   { color: #9ca3af; font-size: .85rem; margin-top: .25rem; }
      .thumb-bottom { margin-top: .45rem; display: flex; justify-content: space-between; color: #6b7280; font-size: .8rem; }

      @media (max-width: 640px) {
        .trailer-player-wrapper { width: 95%; }
        .marquee-item { flex: 0 0 220px; width: 220px; }
        .thumb-image-wrap { height: 125px; }
        .ctrl-btn { font-size: 11px; padding: 5px 11px; }
        .player-controls { top: 8px; right: 8px; }
      }
    `;
    document.head.appendChild(s);
  }, []);

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

  const selectTrailer = (trailer) => {
    const idx = trailers.findIndex((t) => t.id === trailer.id);
    if (idx >= 0) setCurrentIndex(idx);
  };

  const indicatorItems = trailers.slice(0, 4);
  const loopItems      = trailers.length > 0 ? [...trailers, ...trailers] : [];

  return (
    <div className='px-6 md:px-16 lg:px-24 py-20 overflow-hidden'>
      <p className=' text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 '>Trailers</p>

      <div className='trailer-frame relative mt-6'>
        <BlurCircle top='220px' right='-100px' />
        <BlurCircle top='-40px'  left='-20px'  />

        <div className='trailer-player-wrapper'>
          <div className='trailer-player'>

            {currentTrailer && (
              <div className='video-crop'>
                <iframe
                  ref={iframeRef}
                  key={currentTrailer.id}
                  src={buildEmbedUrl(currentTrailer)}
                  title={currentTrailer.title}
                  allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
                  allowFullScreen
                />
              </div>
            )}

            {currentTrailer && (
              <div className='player-controls'>
                <button
                  className={`ctrl-btn ${isPaused ? 'is-paused' : 'is-playing'}`}
                  onClick={togglePause}
                >
                  <span className='ctrl-dot' />
                  {isPaused ? 'Playing' : 'Paused'}
                </button>

                <button
                  className={`ctrl-btn ${isMuted ? 'is-muted' : 'is-sound'}`}
                  onClick={toggleMute}
                >
                  <span className='ctrl-dot' />
                  {isMuted ? 'Muted' : 'Sound'}
                </button>
              </div>
            )}

          </div>
        </div>

        {currentTrailer && (
          <div className='trailer-info'>
            <h3 className='text-2xl text-white font-semibold'>{currentTrailer.title}</h3>

            <div className='flex gap-3 items-center flex-wrap mt-2 text-sm text-gray-300'>
              <span>{currentTrailer.release_date?.substring(0, 4) || 'N/A'}</span>
              <span>•</span>
              <span>{currentTrailer.videoName || 'Official Trailer'}</span>
              <span className='quality-badge'>{currentTrailer.qualityLabel || 'HD'}</span>
            </div>

            <p className='text-sm text-gray-300 mt-2'>
              {currentTrailer.overview?.length > 180
                ? `${currentTrailer.overview.slice(0, 180)}…`
                : currentTrailer.overview}
            </p>

            <div className='indicator-wrap'>
              {indicatorItems.map((item) => (
                <button
                  key={`dot-${item.id}`}
                  className={`indicator-btn ${trailers[currentIndex]?.id === item.id ? 'active' : ''}`}
                  onClick={() => selectTrailer(item)}
                />
              ))}
            </div>
          </div>
        )}

        <div className='marquee'>
          <div className='marquee-track animate '>
            {loopItems.map((t, i) => (
              <button
                key={`${t.id}-${i}`}
                className={`marquee-item flex flex-col justify-start h-65 ${currentTrailer?.id === t.id ? 'active' : ''}`}
                onClick={() => selectTrailer(t)}
              >
                <div className='thumb-image-wrap '>
                  <img
                    src={t.backdrop_path || t.poster_path}
                    alt={t.title}
                  />
                </div>
                <div className='thumb-meta'>
                  <p className='thumb-title'>{t.title}</p>
                  <p className='thumb-sub'>{t.videoName || 'Official Trailer'}</p>
                  <div className='thumb-bottom'>
                    <span>{t.release_date?.substring(0, 4) || 'N/A'}</span>
                    <span className='inline-flex items-center gap-1'>
                      <Star className='w-3 h-3 fill-yellow-400 text-yellow-400' />
                      {t.qualityLabel}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {hasError ? (
          <div className='py-8'>
            <Loading />
          </div>
        ) : isLoading ? (
          <p className='text-xl md:text-xl lg:text-xl font-semibold text-white mt-5 mb-55 justify-center text-center'>Loading trailer...</p>
        ) : null}
      </div>
    </div>
  );
};

export default TrailerSection;