import React, { useState, useEffect, useRef } from 'react'
import ReactPlayer from 'react-player'
import BlurCircle from './BlurCircle'
import { PlayCircleIcon } from 'lucide-react';
import { fetchLatestTrailers } from '../services/tmdb'

const TrailerSection = () => {
  const [trailers, setTrailers] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const styleRef = useRef(false);

  const currentTrailer = trailers[currentIndex] || null;

  useEffect(() => {
    if (styleRef.current) return;
    styleRef.current = true;
    const s = document.createElement('style');
    s.textContent = `
      .trailer-frame { border-top: 2px solid rgba(255,255,255,0.08); overflow: visible; margin-left: -1.5rem; margin-right: -1.5rem; }
      .trailer-player-wrapper { width: 100%; }
      .trailer-player { position: relative; width: 100%; min-height: 55vh; }
      .trailer-player .react-player { position: absolute !important; top: 0; left: 0; }
      .trailer-info { color: #d1d5db; margin-top: 18px; max-width: 1200px; margin-left: auto; margin-right: auto; padding: 0 1.5rem; }
      .trailer-meta { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
      .quality-badge { border: 1px solid rgba(255,255,255,.25); border-radius: 9999px; padding: 2px 10px; font-size: 12px; }
      .indicator-wrap { display: flex; gap: 10px; align-items: center; margin-top: 14px; }
      .indicator-btn { width: 10px; height: 10px; border-radius: 9999px; background: rgba(255,255,255,0.35); transition: all .2s ease; }
      .indicator-btn.active { width: 28px; background: #fff; }
      .marquee { overflow-x: auto; width: 100%; padding: 0 1.5rem 1rem; margin-top: 1rem; }
      .marquee-track { display: flex; gap: .75rem; align-items: center; min-width: max-content; }
      .marquee-item { flex: 0 0 220px; width: 220px; cursor: pointer; position: relative; border-radius: 10px; overflow: hidden; border: 2px solid transparent; }
      .marquee-item.active { border-color: rgba(255,255,255,0.7); }
      .marquee-item img { width: 100%; height: 124px; object-fit: cover; display: block; }
      .marquee-item .play-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.95; }
      @media (max-width: 640px) {
        .trailer-frame { margin-left: -1rem; margin-right: -1rem; }
        .trailer-player { min-height: 36vh; }
        .marquee-item { flex: 0 0 180px; width: 180px; }
        .marquee-item img { height: 102px; }
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
        setCurrentIndex(0);
      } catch (e) {
        console.error('Failed to load trailers', e);
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

  return (
    <div className='px-6 md:px-16 lg:px-24 py-20 overflow-visible'>
      <p className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2'>Trailers</p>

      <div className='trailer-frame relative mt-6'>
        <BlurCircle top='220px' right='-100px'/>
        <BlurCircle top='-40px' left='-20px'/>

        <div className='trailer-player-wrapper'>
          <div className='trailer-player' style={{ paddingTop: currentTrailer ? '56.25%' : '56.25%' }}>
            {currentTrailer && (
              <ReactPlayer
                url={currentTrailer.videoUrl}
                controls
                width='100%'
                height='100%'
                className='react-player'
                style={{ position: 'absolute', top: 0, left: 0 }}
              />
            )}
          </div>
        </div>

        {currentTrailer && (
          <div className='trailer-info'>
            <h3 className='text-2xl text-white font-semibold'>{currentTrailer.title}</h3>
            <div className='trailer-meta mt-2 text-sm text-gray-300'>
              <span>{currentTrailer.release_date ? currentTrailer.release_date.substring(0, 4) : 'N/A'}</span>
              <span>•</span>
              <span>{currentTrailer.videoName || 'Official Trailer'}</span>
              <span className='quality-badge'>{currentTrailer.qualityLabel || 'HD'}</span>
            </div>
            <p className='text-sm text-gray-300 mt-2'>
              {currentTrailer.overview ? currentTrailer.overview.slice(0, 220) + (currentTrailer.overview.length > 220 ? '…' : '') : ''}
            </p>
            <div className='indicator-wrap'>
              {indicatorItems.map((item, idx) => (
                <button
                  key={`dot-${item.id}`}
                  aria-label={`Xem trailer ${idx + 1}`}
                  className={`indicator-btn ${currentTrailer.id === item.id ? 'active' : ''}`}
                  onClick={() => selectTrailer(item)}
                />
              ))}
            </div>
          </div>
        )}

        <div className='marquee'>
          <div className='marquee-track'>
            {trailers.map((t) => (
              <button key={t.id} type='button' className={`marquee-item ${currentTrailer?.id === t.id ? 'active' : ''}`} onClick={() => selectTrailer(t)}>
                <img src={t.backdrop_path || t.poster_path} alt={t.title} />
                <PlayCircleIcon className='play-overlay w-8 h-8 text-white/90' />
              </button>
            ))}
          </div>
        </div>

        {isLoading && <p className='text-gray-400 text-sm px-6 pb-4'>Đang tải trailer chất lượng cao...</p>}
      </div>
    </div>
  )
}

export default TrailerSection
