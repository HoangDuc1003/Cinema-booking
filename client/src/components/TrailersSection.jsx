import React, { useState, useEffect, useRef } from 'react'
import ReactPlayer from 'react-player'
import BlurCircle from './BlurCircle'
import { PlayCircleIcon, Star } from 'lucide-react';
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
      .trailer-player-wrapper { width: 75%; margin: 0 auto; }
      .trailer-player { position: relative; width: 100%; padding-top: 56.25%; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,.45); background: #02050b; }
      .trailer-player .react-player { position: absolute !important; top: 0; left: 0; }
      .trailer-info { color: #d1d5db; margin-top: 18px; max-width: 1000px; margin-left: auto; margin-right: auto; padding: 0 1.5rem; }
      .trailer-meta { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
      .quality-badge { border: 1px solid rgba(255,255,255,.25); border-radius: 9999px; padding: 2px 10px; font-size: 12px; }
      .indicator-wrap { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 16px; }
      .indicator-btn { width: 10px; height: 10px; border-radius: 9999px; background: rgba(255,255,255,0.35); transition: all .25s ease; }
      .indicator-btn.active { width: 28px; background: #f43f5e; }

      .marquee { overflow: hidden; width: 100%; padding: 0 1.5rem 1.5rem; margin-top: 1.25rem; }
      .marquee-track { display: flex; gap: 1rem; align-items: stretch; min-width: max-content; }
      .marquee-track.animate { animation: trailerMove linear infinite; animation-duration: 40s; }
      .marquee-track.animate:hover { animation-play-state: paused; }
      @keyframes trailerMove { from { transform: translateX(0); } to { transform: translateX(-50%); } }

      .marquee-item { flex: 0 0 280px; width: 280px; cursor: pointer; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12); background: #06080f; text-align: left; transition: transform .25s ease, border-color .25s ease; }
      .marquee-item:hover { transform: translateY(-3px); border-color: rgba(244,63,94,.7); }
      .marquee-item.active { border-color: rgba(255,255,255,0.75); box-shadow: 0 0 0 2px rgba(255,255,255,0.15) inset; }
      .thumb-image-wrap { position: relative; }
      .marquee-item img { width: 100%; height: 155px; object-fit: cover; display: block; }
      .marquee-item .play-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.95; }
      .thumb-meta { background: linear-gradient(180deg, rgba(9,11,17,0.92), rgba(3,4,8,0.98)); padding: .8rem .85rem; }
      .thumb-title { color: #fff; font-weight: 600; font-size: .98rem; line-height: 1.3; }
      .thumb-sub { color: #9ca3af; font-size: .85rem; margin-top: .25rem; }
      .thumb-bottom { margin-top: .45rem; display: flex; justify-content: space-between; color: #6b7280; font-size: .8rem; }

      @media (max-width: 640px) {
        .trailer-frame { margin-left: -1rem; margin-right: -1rem; }
        .trailer-player-wrapper { width: 90%; }
        .marquee-item { flex: 0 0 220px; width: 220px; }
        .marquee-item img { height: 125px; }
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
  const loopItems = trailers.length > 0 ? [...trailers, ...trailers] : [];

  return (
    <div className='px-6 md:px-16 lg:px-24 py-20 overflow-visible'>
      <p className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2'>Trailers</p>

      <div className='trailer-frame relative mt-6'>
        <BlurCircle top='220px' right='-100px'/>
        <BlurCircle top='-40px' left='-20px'/>

        <div className='trailer-player-wrapper'>
          <div className='trailer-player'>
            {currentTrailer && (
              <ReactPlayer
                url={currentTrailer.videoUrl}
                controls
                playing={false}
                width='100%'
                height='100%'
                className='react-player'
                style={{ position: 'absolute', top: 0, left: 0 }}
                config={{ playerVars: { rel: 0, modestbranding: 1 } }}
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
              {currentTrailer.overview ? currentTrailer.overview.slice(0, 180) + (currentTrailer.overview.length > 180 ? '…' : '') : ''}
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
          <div className='marquee-track animate'>
            {loopItems.map((t, i) => (
              <button key={`${t.id}-${i}`} type='button' className={`marquee-item ${currentTrailer?.id === t.id ? 'active' : ''}`} onClick={() => selectTrailer(t)}>
                <div className='thumb-image-wrap'>
                  <img src={t.backdrop_path || t.poster_path} alt={t.title} />
                  <PlayCircleIcon className='play-overlay w-8 h-8 text-white/90' />
                </div>
                <div className='thumb-meta'>
                  <p className='thumb-title'>{t.title}</p>
                  <p className='thumb-sub'>{t.videoName || 'Official Trailer'}</p>
                  <div className='thumb-bottom'>
                    <span>{t.release_date ? t.release_date.substring(0, 4) : 'N/A'}</span>
                    <span className='inline-flex items-center gap-1'><Star className='w-3 h-3 fill-yellow-400 text-yellow-400'/> {t.qualityLabel || 'HD'}</span>
                  </div>
                </div>
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
