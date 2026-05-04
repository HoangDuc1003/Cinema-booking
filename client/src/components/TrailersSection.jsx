import React, { useState, useEffect, useRef } from 'react'
import ReactPlayer from 'react-player'
import BlurCircle from './BlurCircle'
import { PlayCircleIcon } from 'lucide-react';
import { fetchLatestTrailers } from '../services/tmdb'

// TrailersSection: responsive player + info + marquee of latest trailers
const TrailerSection = () => {
  const [trailers, setTrailers] = useState([]);
  const [currentTrailer, setCurrentTrailer] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const styleRef = useRef(false);

  useEffect(() => {
    if (styleRef.current) return;
    styleRef.current = true;
    const s = document.createElement('style');
    s.textContent = `
      .trailer-frame { border-top: 2px solid rgba(255,255,255,0.08); padding-top: 10px; overflow: visible; }
      .trailer-player-wrapper { max-width: 900px; margin: 0 auto; }
      .trailer-player { position: relative; width: 100%; }
      .trailer-player .react-player { position: absolute !important; top: 0; left: 0; }
      .trailer-info { color: #d1d5db; margin-top: 12px; max-width: 900px; margin-left: auto; margin-right: auto; }
      .marquee { overflow: hidden; width: 100%; }
      .marquee-track { display: flex; gap: 1rem; align-items: center; }
      .marquee-item { flex: 0 0 25%; max-width: 25%; cursor: pointer; position: relative; }
      .marquee-item img { width: 100%; height: auto; border-radius: 8px; display: block; }
      .marquee-item .play-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.95; }
      @keyframes marqueeLR { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      .marquee-animate { animation-timing-function: linear; animation-iteration-count: infinite; animation-name: marqueeLR; }
      @media (max-width: 640px) {
        .trailer-player-wrapper { max-width: 60vw; }
        .trailer-player { height: 33vh; padding-top: 0 !important; }
        .marquee-item { flex: 0 0 50%; max-width: 50%; }
      }
    `;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchLatestTrailers({ limit: 10, ttlHours: 2, pagesToSearch: 3 });
        if (!mounted) return;
        setTrailers(data);
        setCurrentTrailer(prev => prev || data[0] || null);
      } catch (e) {
        console.error('Failed to load trailers', e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    const id = setInterval(load, 1000 * 60 * 60 * 2); // refresh every 2 hours
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const marqueeDuration = Math.max(12, (trailers.length || 10) * 2 + 10);

  return (
    <div className='px-6 md:px-16 lg:px-24 py-20 overflow-hidden'>
        <p className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2'>Trailers</p>

        <div className='trailer-frame relative mt-6'>
          <BlurCircle top='220px' right='-100px'/>
          <BlurCircle top='-40px' left='-20px'/>  

          <div className='trailer-player-wrapper'>
            <div className='trailer-player' style={{ paddingTop: currentTrailer ? '56.25%' : '56.25%' }}>
              {currentTrailer && (
                <ReactPlayer url={currentTrailer.videoUrl} controls width='100%' height='100%'
                  style={{ position: 'absolute', top: 0, left: 0 }} />
              )}
            </div>
          </div>

          {currentTrailer && (
            <div className='trailer-info'>
              <h3 className='text-xl text-white font-semibold mt-3'>{currentTrailer.title}</h3>
              <p className='text-sm text-gray-300 mt-1'>{currentTrailer.release_date ? currentTrailer.release_date.substring(0,4) : ''} • {currentTrailer.overview ? currentTrailer.overview.slice(0,140) + (currentTrailer.overview.length > 140 ? '…' : '') : ''}</p>
            </div>
          )}

          <div className='marquee mt-6'>
            <div className={`marquee-track marquee-animate`} style={{ animationDuration: `${marqueeDuration}s` }}>
              {[...trailers, ...trailers].map((t, i) => (
                <div key={`${t.id}-${i}`} className='marquee-item' onClick={() => setCurrentTrailer(t)}>
                  <img src={t.poster_path || t.backdrop_path} alt={t.title} />
                  <PlayCircleIcon className='play-overlay w-8 h-8 md:w-12 md:h-12 text-white/90' />
                </div>
              ))}
            </div>
          </div>
        </div>
    </div>
  )
}

export default TrailerSection
