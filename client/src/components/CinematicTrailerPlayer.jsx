import React, { useEffect, useState, useRef } from 'react';
import { Star, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import useYouTubePlayer from '../hooks/useYouTubePlayer';

const CinematicTrailerPlayer = ({
  videoId,
  movieTitle,
  rating,
  year,
  qualityLabel,
  currentIndex,
  total,
  onNext,
  onPrevious,
  className = '',
}) => {
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevVideoIdRef = useRef(videoId);
  
  useEffect(() => {
    if (videoId !== prevVideoIdRef.current) {
      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setIsTransitioning(false);
      }, 500); 
      prevVideoIdRef.current = videoId;
      return () => clearTimeout(timer);
    }
  }, [videoId]);

  const handleReady = (player) => {
    player.mute();
    setIsMuted(true);
  };

  const handleStateChange = (event) => {
    if (event.data === window.YT.PlayerState.PLAYING) {
      setIsPaused(false);
    } else if (event.data === window.YT.PlayerState.PAUSED) {
      setIsPaused(true);
    }
  };

  const handleEnded = () => {
    if (onNext) onNext();
  };
  
  const handleError = (e) => {
    console.warn("Trailer Player Error:", e);
    if (onNext) onNext();
  };

  const { containerRef, player } = useYouTubePlayer({
    videoId,
    onReady: handleReady,
    onStateChange: handleStateChange,
    onEnded: handleEnded,
    onError: handleError,
    playerVars: {
      mute: 1, 
    }
  });

  const togglePause = () => {
    if (!player) return;
    if (isPaused) {
      player.playVideo();
    } else {
      player.pauseVideo();
    }
  };

  const toggleMute = () => {
    if (!player) return;
    if (isMuted) {
      player.unMute();
      setIsMuted(false);
    } else {
      player.mute();
      setIsMuted(true);
    }
  };

  useEffect(() => {
    const s = document.createElement('style');
    s.innerHTML = `
      .cinematic-player-wrapper {
        position: relative;
        width: 100%;
        margin: 0 auto;
      }
      .cinematic-player-viewport {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 7.5;
        overflow: hidden;
        background: #000;
      }
      @media (max-width: 768px) {
        .cinematic-player-viewport {
          aspect-ratio: 16 / 8.5;
        }
      }
      .cinematic-player-frame {
        position: absolute;
        top: 50%;
        left: 0;
        width: 100%;
        aspect-ratio: 16 / 9;
        transform: translateY(-50%) scale(1.04);
        pointer-events: none;
      }
      .cinematic-player-frame iframe {
        width: 100%;
        height: 100%;
        border: none;
      }
      .cinematic-top-mask {
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 15%;
        background: linear-gradient(to bottom, rgba(10,12,20,1) 0%, transparent 100%);
        z-index: 5;
        pointer-events: none;
      }
      .cinematic-bottom-mask {
        position: absolute;
        bottom: 0; left: 0; right: 0;
        height: 25%;
        background: linear-gradient(to top, rgba(10,12,20,1) 0%, transparent 100%);
        z-index: 5;
        pointer-events: none;
      }
      .cinematic-fade-overlay {
        position: absolute;
        inset: 0;
        background: #000;
        z-index: 10;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.5s ease;
      }
      .cinematic-fade-overlay.active {
        opacity: 1;
      }
      .cinematic-center-btn {
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        z-index: 20;
        width: 64px; height: 64px;
        border-radius: 50%;
        background: rgba(0,0,0,0.4);
        backdrop-filter: blur(12px);
        border: 2px solid rgba(255,255,255,0.18);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
        opacity: 0;
      }
      .cinematic-player-viewport:hover .cinematic-center-btn { opacity: 1; }
      .cinematic-center-btn:hover {
        background: rgba(248,69,101,0.55);
        border-color: rgba(248,69,101,0.8);
        transform: translate(-50%, -50%) scale(1.1);
        box-shadow: 0 0 28px rgba(248,69,101,0.4);
      }
      .cinematic-mute-btn {
        position: absolute;
        bottom: 24px; right: 24px;
        z-index: 20;
        width: 38px; height: 38px;
        border-radius: 50%;
        background: rgba(0,0,0,0.5);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.15);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        transition: all 0.25s ease;
        color: #fff;
      }
      .cinematic-mute-btn:hover { background: rgba(255,255,255,0.15); }
      .cinematic-mute-btn.is-muted { color: #F84565; border-color: rgba(248,69,101,0.4); }
    `;
    document.head.appendChild(s);
    return () => s.remove();
  }, []);

  return (
    <div className={`cinematic-player-wrapper ${className}`}>
      <div className="w-full md:w-[95%] lg:w-[85%] max-w-[1040px] mx-auto">
        <div className="cinematic-player-viewport">
          <div className="cinematic-top-mask" />
          <div className="cinematic-bottom-mask" />
          <div className={`cinematic-fade-overlay ${isTransitioning ? 'active' : ''}`} />
          
          <div className="cinematic-player-frame" ref={containerRef} />
          
          <button 
            className="cinematic-center-btn" 
            onClick={togglePause} 
            aria-label={isPaused ? 'Play' : 'Pause'}
            aria-pressed={!isPaused}
          >
            {isPaused ? <Play className="w-6 h-6 text-white ml-1" /> : <Pause className="w-5 h-5 text-white" />}
          </button>
          
          <button 
            className={`cinematic-mute-btn ${isMuted ? 'is-muted' : ''}`} 
            onClick={toggleMute} 
            aria-label={isMuted ? 'Unmute' : 'Mute'}
            aria-pressed={isMuted}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-4 px-2">
          <div>
            <h3 className="text-xl font-bold text-white mb-1 line-clamp-1">{movieTitle || 'Official Trailer'}</h3>
            <div className="flex items-center gap-2 flex-wrap">
              {rating && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-400/15 text-yellow-400 border border-yellow-400/25">
                  <Star className="w-3 h-3 fill-yellow-400" />
                  {Number(rating).toFixed(1)}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/30">
                Official
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/10 text-gray-300 border border-white/10">
                {year || 'N/A'}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/10 text-gray-300 border border-white/10">
                {qualityLabel || 'HD'}
              </span>
            </div>
          </div>
          
          {total > 1 && (
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-400">
                {currentIndex + 1} / {total}
              </span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={onPrevious}
                  aria-label="Previous trailer"
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-300 hover:bg-primary/20 hover:text-white hover:border-primary/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button 
                  onClick={onNext}
                  aria-label="Next trailer"
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-300 hover:bg-primary/20 hover:text-white hover:border-primary/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CinematicTrailerPlayer;
