import React from 'react';
import { StarIcon, Calendar, Clock, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import timeFormat from '../lib/timeFormat';

const MovieCard = ({ movie }) => {
  const navigate = useNavigate();

  const handleNavigate = () => {
    navigate(`/movies/${movie._id}`);
    window.scrollTo(0, 0);
  };

  const releaseYear = movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A';
  const durationDisplay = movie.runtime ? timeFormat(movie.runtime) : (movie.duration || 'N/A');
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : (movie.rating || '0.0');
  
  {/* chore: Main wrapper */}
  return (
    
    <div 
      onClick={handleNavigate}
      className="relative w-full aspect-2/3 rounded-2xl overflow-hidden group cursor-pointer bg-gray-900 border border-gray-800 hover:border-pink-500/50 transition-colors duration-500 shadow-lg"
    >
      
      {/* ui: Background image */}
      <img 
        src={movie.poster_path || movie.backdrop_path || movie.poster} 
        alt={movie.title} 
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
      />
      
      {/* ui: Hover dark overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-500 z-10 pointer-events-none"></div>

      {/* feat: Rating badge */}
      <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md px-2 py-1 rounded-md flex items-center gap-1.5 z-30 border border-white/10">
        <StarIcon className="w-3.5 h-3.5 text-pink-500 fill-pink-500" />
        <span className="text-white font-bold text-xs">{rating}</span>
      </div>

      {/* feat: Play button (center) */}
      <div className="absolute inset-0 flex items-center justify-center pb-12 z-20 pointer-events-none">
        <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-xl border border-white/30 shadow-[0_8px_32px_rgba(255,255,255,0.2)] flex items-center justify-center opacity-0 scale-50 group-hover:opacity-100 group-hover:scale-100 transition-all duration-500 ease-out">
          <Play className="w-6 h-6 text-white fill-white ml-1" />
        </div>
      </div>

      {/* ui: Bottom info panel */}
      <div className="absolute bottom-0 left-0 w-full flex flex-col justify-end p-4 pt-10 z-30 translate-y-8 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 ease-out">
        
        {/* ui: Movie title */}
        <h3 className="text-white font-bold text-lg truncate mb-1.5 drop-shadow-md">
          {movie.title}
        </h3>
        
        {/* ui: Meta info (date & time) */}

        <div className="flex items-center gap-3 text-xs text-gray-300 mb-3">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-pink-500" />
            <span className="font-medium">{releaseYear}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-pink-500" />
            <span className="font-medium">{durationDisplay}</span>
          </div>
        </div>
        
        {/* feat: Buy ticket button */}
        <button className="w-full py-2.5 text-sm bg-pink-500 backdrop-blur-xl border border-pink-300 shadow-[0_8px_32px_rgba(255,255,255,0.2)] flex items-center justify-center text-white rounded-xl font-bold transition-all hover:shadow-[0_0_25px_rgba(219,39,119,0.5)] hover:bg-pink-600 active:scale-95 pointer-events-auto cursor-pointer">
          Buy Ticket
        </button>
      </div>
      
    </div>
  );
};

export default MovieCard;