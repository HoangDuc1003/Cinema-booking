import React, { useCallback, useState, useEffect } from 'react';
import { StarIcon, Calendar, Clock, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import timeFormat from '../lib/timeFormat';
import { fetchMovieDetails } from '../services/tmdb';

const MovieCard = ({ movie }) => {
  const navigate = useNavigate();

  // feat: Stable navigate callback to avoid re-creating function on every render
  const handleNavigate = useCallback(() => {
    navigate(`/movies/${movie._id}`);
    window.scrollTo(0, 0);
  }, [navigate, movie._id]);

  // chore: Extract movie metadata
  const releaseYear = movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A';
  const isNumeric = (v) => v != null && !isNaN(Number(v));

  // try initial values (runtime or duration from props)
  const [runtimeMinutes, setRuntimeMinutes] = useState(() => {
    if (isNumeric(movie.runtime)) return Number(movie.runtime);
    if (isNumeric(movie.duration)) return Number(movie.duration);
    return null;
  });

  // fetch details from TMDB when runtime missing
  useEffect(() => {
    let mounted = true;
    if (runtimeMinutes == null) {
      const tmdbId = movie.id || (movie._id && !isNaN(Number(movie._id)) ? Number(movie._id) : null);
      if (tmdbId) {
        fetchMovieDetails(tmdbId)
          .then((data) => {
            if (!mounted) return;
            if (isNumeric(data?.runtime)) setRuntimeMinutes(Number(data.runtime));
          })
          .catch(() => {});
      }
    }
    return () => { mounted = false; };
  }, [runtimeMinutes, movie.id, movie._id]);

  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : (movie.rating || '0.0');
  
  return (
    <div 
      onClick={handleNavigate}
      className="relative w-full aspect-2/3 rounded-2xl overflow-hidden group cursor-pointer bg-gray-900 border border-gray-800
       hover:border-pink-500/50 transition-colors duration-500 shadow-lg"
    >
      {/* chore: Card main wrapper */}
      {/* feat: Background image with hover zoom effect (lazy-loaded, async decoding) */}
      <img 
        src={movie.poster_path || movie.backdrop_path || movie.poster} 
        alt={movie.title} 
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
      />
      
      {/* feat: Dark overlay on hover */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-500 z-10 pointer-events-none"></div>

      {/* feat: Rating badge */}
      <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md px-2 py-1 rounded-md flex items-center gap-1.5 z-30 border
       border-white/10">
        <StarIcon className="w-3.5 h-3.5 text-pink-500 fill-pink-500" />
        <span className="text-white font-bold text-xs">{rating}</span>
      </div>

      {/* feat: Play button (center) */}
      <div className="absolute inset-0 flex items-center justify-center pb-12 z-49 pointer-events-none">
        <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-xl border border-white/30 shadow-[0_8px_32px_rgba(255,255,255,0.2)] 
        flex items-center 
        justify-center opacity-0 scale-50 group-hover:opacity-100 group-hover:scale-100 transition-all duration-500 ease-out">
          <Play className="w-6 h-6 text-white fill-white ml-1" />
        </div>
      </div>

      {/* ui: Bottom info panel */}
      <div className="absolute bottom-0 left-0 w-full flex flex-col justify-end p-4 pt-10 z-30 translate-y-8 opacity-0 group-hover:translate-y-0
       group-hover:opacity-100 
      transition-all duration-500 ease-out">
        
        {/* feat: Movie title display */}
        <h3 className="text-white font-bold text-lg truncate mb-1.5 drop-shadow-md">
          {movie.title}
        </h3>
        
        {/* feat: Metadata section with release date and duration */}
        <div className="flex items-center gap-3 text-xs text-gray-300 mb-3">
          {/* chore: Release year display */}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-pink-500" />
            <span className="font-medium">{releaseYear}</span>
          </div>
          <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-pink-500" />
              <span className="font-medium">{timeFormat(runtimeMinutes)}</span>
            </div>
        </div>
        
        {/* feat: Buy ticket action button */}
        <button className="w-full py-2.5 text-sm bg-pink-500 backdrop-blur-xl border border-pink-300 shadow-[0_8px_32px_rgba(255,255,255,0.2)] flex items-center 
        justify-center text-white rounded-xl font-bold transition-all hover:shadow-[0_0_25px_rgba(219,39,119,0.5)] hover:bg-pink-600 active:scale-95 pointer-events-auto 
        cursor-pointer">
          Buy Ticket
        </button>
      </div>
    </div>
  );
};
 
export default React.memo(MovieCard);