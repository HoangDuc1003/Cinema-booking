import React, { useEffect, useState, useRef } from 'react';
import { Star, ChevronLeft, ChevronRight, Volume2, VolumeX } from 'lucide-react';
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
  const [audioState, setAudioState] = useState(() => ({ videoId, muted: true }));
  const [volume, setVolume] = useState(35);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevVideoIdRef = useRef(videoId);
  const isMuted = audioState.videoId === videoId ? audioState.muted : true;
  
  useEffect(() => {
    if (videoId !== prevVideoIdRef.current) {
      setIsTransitioning(true);
      setAudioState({ videoId, muted: true });
      const timer = setTimeout(() => {
        setIsTransitioning(false);
      }, 500); 
      prevVideoIdRef.current = videoId;
      return () => clearTimeout(timer);
    }
  }, [videoId]);

  const handleEnded = () => {
    if (onNext) onNext();
  };
  
  const handleError = (e) => {
    console.warn("Trailer Player Error:", e);
  };

  const { containerRef, player } = useYouTubePlayer({
    videoId,
    muted: isMuted,
    onEnded: handleEnded,
    onError: handleError,
  });

  useEffect(() => {
    if (!player) return;
    player.setVolume?.(volume);
    if (isMuted) player.mute?.();
  }, [isMuted, player, volume]);

  const toggleMute = () => {
    if (!player) return;
    if (isMuted) {
      const nextVolume = volume || 35;
      setVolume(nextVolume);
      player.setVolume?.(nextVolume);
      player.unMute();
      setAudioState({ videoId, muted: false });
    } else {
      player.mute();
      setAudioState({ videoId, muted: true });
    }
  };

  const handleVolumeChange = (event) => {
    const nextVolume = Math.min(100, Math.max(0, Number(event.target.value) || 0));
    setVolume(nextVolume);
    if (!player) return;
    player.setVolume?.(nextVolume);
    if (nextVolume === 0) {
      player.mute?.();
      setAudioState({ videoId, muted: true });
    } else if (isMuted) {
      player.unMute?.();
      setAudioState({ videoId, muted: false });
    }
  };

  useEffect(() => {
    if (!import.meta.env.DEV || !player) return undefined;
    const diagnostic = {
      getSnapshot: () => {
        let captionModules = [];
        let captionTracks = [];
        try {
          captionModules = player.getOptions?.() || [];
          captionTracks = player.getOption?.('captions', 'tracklist') || [];
        } catch {
          // Diagnostics must remain best-effort like the shared caption control.
        }
        return {
          kind: 'youtube',
          videoId: player.getVideoData?.()?.video_id || videoId,
          playerState: player.getPlayerState?.(),
          currentTime: Number(player.getCurrentTime?.()) || 0,
          captionModuleAvailable: captionModules.includes?.('captions') || false,
          captionTrackCount: Array.isArray(captionTracks) ? captionTracks.length : 0,
        };
      },
    };
    window.__NITROCINE_TRAILER_PLAYER_DIAGNOSTICS__ = diagnostic;
    return () => {
      if (window.__NITROCINE_TRAILER_PLAYER_DIAGNOSTICS__ === diagnostic) {
        delete window.__NITROCINE_TRAILER_PLAYER_DIAGNOSTICS__;
      }
    };
  }, [player, videoId]);

  useEffect(() => {
    const s = document.createElement('style');
    s.innerHTML = `
      .cinematic-player-wrapper {
        width: 100%;
        min-width: 0;
        margin: 0 auto;
      }
      .cinematic-player-card {
        position: relative;
        width: 100%;
        margin: 0 auto;
        padding: clamp(8px, 1.35vw, 16px);
        overflow: hidden;
        isolation: isolate;
        background: linear-gradient(145deg, rgba(248,69,101,0.12), rgba(18,20,31,0.88) 48%, rgba(248,69,101,0.07));
        border: 1px solid rgba(248,69,101,0.22);
        border-radius: clamp(12px, 1.3vw, 18px);
        box-shadow: 0 24px 80px rgba(0,0,0,0.42);
      }
      .cinematic-player-card::before {
        content: '';
        position: absolute;
        inset: -20%;
        z-index: -1;
        background: radial-gradient(ellipse at center, rgba(248,69,101,0.08), transparent 58%);
        pointer-events: none;
      }
      .cinematic-player-viewport {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        background: #000;
        border-radius: clamp(8px, 0.9vw, 12px);
      }
      .cinematic-player-frame {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1;
      }
      .cinematic-player-frame > div,
      .cinematic-player-frame iframe {
        display: block;
        width: 100% !important;
        height: 100% !important;
        border: 0;
      }
      .cinematic-top-mask {
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 10%;
        background: linear-gradient(to bottom, rgba(0,0,0,0.48), transparent);
        z-index: 6;
        pointer-events: none;
      }
      .cinematic-bottom-mask {
        position: absolute;
        bottom: 0; left: 0; right: 0;
        height: 16%;
        background: linear-gradient(to top, rgba(0,0,0,0.62), transparent);
        z-index: 6;
        pointer-events: none;
      }
      .cinematic-focus-vignette {
        position: absolute;
        inset: 0;
        z-index: 7;
        background: radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.16) 78%, rgba(0,0,0,0.42) 100%);
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
      .cinematic-volume-control {
        position: absolute;
        right: 24px;
        bottom: 24px;
        z-index: 20;
      }
      .cinematic-mute-btn {
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
      .cinematic-volume-popover {
        position: absolute;
        right: 0;
        bottom: calc(100% + 10px);
        display: flex;
        align-items: center;
        gap: 7px;
        width: 176px;
        padding: 9px 10px;
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 12px;
        background: rgba(8,10,16,0.92);
        box-shadow: 0 14px 34px rgba(0,0,0,0.4);
        backdrop-filter: blur(14px);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: translateY(6px) scale(0.96);
        transform-origin: bottom right;
        transition: opacity 180ms ease, visibility 180ms ease, transform 180ms ease;
      }
      .cinematic-volume-control:hover .cinematic-volume-popover,
      .cinematic-volume-control:focus-within .cinematic-volume-popover {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translateY(0) scale(1);
      }
      .cinematic-volume-popover svg { flex: 0 0 auto; width: 14px; height: 14px; color: rgba(255,255,255,0.72); }
      .cinematic-volume-popover input[type="range"] { width: 100%; accent-color: #F84565; cursor: pointer; }
      .cinematic-volume-popover input[type="range"]:focus-visible { outline: 2px solid rgba(255,255,255,0.92); outline-offset: 4px; }
      .cinematic-volume-value { min-width: 31px; color: rgba(255,255,255,0.86); font-size: 11px; font-variant-numeric: tabular-nums; text-align: right; }
      .cinematic-player-details {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 68px;
        gap: 20px;
        padding: clamp(12px, 1.4vw, 18px) clamp(4px, 0.7vw, 10px) 2px;
      }
      .cinematic-player-copy { min-width: 0; }
      .cinematic-player-actions {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 16px;
      }
      @media (max-width: 640px) {
        .cinematic-player-card { padding: 6px; border-radius: 12px; }
        .cinematic-player-viewport { border-radius: 8px; }
        .cinematic-player-details {
          align-items: flex-start;
          flex-direction: column;
          min-height: 0;
          gap: 12px;
          padding: 12px 6px 6px;
        }
        .cinematic-player-actions {
          width: 100%;
          justify-content: space-between;
        }
      }
    `;
    document.head.appendChild(s);
    return () => s.remove();
  }, []);

  return (
    <div className={`cinematic-player-wrapper ${className}`}>
      <div className="cinematic-player-card">
        <div className="cinematic-player-viewport">
          <div className="cinematic-top-mask" />
          <div className="cinematic-bottom-mask" />
          <div className="cinematic-focus-vignette" />
          <div className={`cinematic-fade-overlay ${isTransitioning ? 'active' : ''}`} />
          
          <div className="cinematic-player-frame" ref={containerRef} />
          
          <div className="cinematic-volume-control">
            <button
              className={`cinematic-mute-btn ${isMuted ? 'is-muted' : ''}`}
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute trailer' : 'Mute trailer'}
              aria-pressed={isMuted}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <div className="cinematic-volume-popover" role="group" aria-label="Trailer volume controls">
              <VolumeX aria-hidden="true" />
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={volume}
                aria-label="Trailer volume"
                aria-valuetext={`${volume} percent${isMuted ? ', muted' : ''}`}
                onChange={handleVolumeChange}
              />
              <Volume2 aria-hidden="true" />
              <span className="cinematic-volume-value">{volume}%</span>
            </div>
          </div>
        </div>

        <div className="cinematic-player-details">
          <div className="cinematic-player-copy">
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
            <div className="cinematic-player-actions">
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
