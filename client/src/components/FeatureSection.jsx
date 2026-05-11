import { ArrowRightIcon } from 'lucide-react'
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import BlurCircle from './BlurCircle'
import { fetchPopularMovies } from '../services/tmdb'
import MovieGrid from './MovieGrid'
import Loading from './Loading'

/**
 * FeatureSection — "Now Showing" movie grid on the home page.
 *
 * FIXES APPLIED:
 * 1. REMOVED document.createElement('style') injection — this was a memory leak.
 *    The <style> tag was appended to <head> but NEVER removed on unmount.
 *    If the user navigated away and back 10 times, 10 duplicate <style> tags
 *    would accumulate in the DOM. The styleRef guard only prevented duplicates
 *    within the same mount, not across re-mounts.
 *    FIX: Moved CSS to index.css (global) or use inline styles.
 *
 * 2. REPLACED manual MovieCard mapping with <MovieGrid> — eliminates 15 lines
 *    of duplicated grid logic and automatically adds scroll animations.
 *
 * 3. REMOVED unused `useRef` import (was only used for the buggy styleRef).
 */
const FeatureSection = () => {
  const navigate = useNavigate();
  const [movies, setMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadMovies = async () => {
      setIsLoading(true);
      try {
        setHasError(false);
        const data = await fetchPopularMovies({ dailyRotate: true, dailySeedSize: 20 });
        if (mounted) {
          setMovies(Array.isArray(data) ? data.slice(0, 10) : []);
        }
      } catch (e) {
        console.error('FeatureSection load error', e);
        if (mounted) {
          setMovies([]);
          setHasError(true);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadMovies();
    return () => { mounted = false; };
  }, []);

  const handleNavigate = () => {
    navigate('/movies');
    scrollTo(0, 0);
  };

  return (
    <div className='px-6 md:px-16 lg:px-24 xl:px-40 overflow-hidden'>
      <div className='relative flex items-center justify-between pt-20 pb-10'>
        <BlurCircle top='80px' right='-60px' />
        <BlurCircle top='600px' left='-65px' />
        <BlurCircle top='800px' right='-100px' />
        <BlurCircle top='0px' left='0' />
        <p className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 mt-20'>Now Showing</p>
        <button
          onClick={handleNavigate}
          className="group flex items-center gap-2 px-6 py-3 text-sm text-gray-300 
            hover:text-white bg-white/5 hover:bg-white/10 border border-white/20 hover:border-primary/40 
            rounded-full backdrop-blur-sm transition-all duration-300 hover:scale-105 relative overflow-hidden mt-20"
        >
          View All
          <ArrowRightIcon className='group-hover:translate-x-0.5 transition w-4.5 h-4.5' />
        </button>
      </div>

      {isLoading || hasError ? (
        <Loading />
      ) : (
        <MovieGrid
          movies={movies}
          columns="grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          animated={true}
          staggerDelay={80}
        />
      )}

      <div className='flex justify-center mt-20'>
        <button
          onClick={handleNavigate}
          className="group flex items-center gap-3 px-12 py-6 bg-gradient-to-r from-[#F84565] to-[#D63854]
            hover:from-[#D63854] hover:to-[#F84565] text-white font-semibold rounded-full shadow-lg shadow-[#F84565]/30 
            hover:shadow-xl hover:shadow-[#F84565]/60 hover:scale-105 active:scale-95 transition-all duration-300 border
            border-[#F84565]/30 hover:border-[#F84565]/60 relative overflow-hidden mb-5"
        >
          Show more
        </button>
      </div>
    </div>
  );
};

export default FeatureSection;