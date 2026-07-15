import { ArrowRightIcon } from 'lucide-react'
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import BlurCircle from './BlurCircle'
import { fetchHomeNowShowing } from '../services/tmdb'
import MovieGrid from './MovieGrid'
import Loading from './Loading'

const FeatureSection = ({ onDataLoaded }) => {
  const navigate = useNavigate();
  const [movies, setMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadMovies = async () => {
      try {
        const data = await fetchHomeNowShowing({ limit: 10 });
        if (mounted) {
          setMovies(Array.isArray(data) ? data.slice(0, 10) : []);
        }
      } catch (e) {
        console.error('FeatureSection load error', e);
      } finally {
        if (mounted) {
          setIsLoading(false);
          if (onDataLoaded) onDataLoaded();
        }
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
    <section
      className='home-now-showing px-4 sm:px-6 md:px-16 lg:px-24 xl:px-40 overflow-hidden'
      aria-labelledby="home-now-showing-title"
    >
      <div className='relative flex items-center justify-between pt-10 sm:pt-5 pb-6 sm:pb-10'>
        <BlurCircle top='80px' right='-60px' />
        <BlurCircle top='600px' left='-65px' />
        <BlurCircle top='800px' right='-100px' />
        <BlurCircle top='0px' left='0' />
        <h2 id="home-now-showing-title" className='relative text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 mt-8 sm:mt-20'>Now Showing</h2>
        <button
          onClick={handleNavigate}
          className="group flex items-center gap-2 px-4 py-2 sm:px-6 sm:py-3 text-[10px] sm:text-sm text-gray-300 
            hover:text-white bg-white/5 hover:bg-white/10 border border-white/20 hover:border-primary/40 
            rounded-full backdrop-blur-sm transition-all duration-300 hover:scale-105 relative overflow-hidden mt-8 sm:mt-20"
        >
          View All
          <ArrowRightIcon className='group-hover:translate-x-0.5 transition w-4 h-4 sm:w-4.5 sm:h-4.5' />
        </button>
      </div>

      {isLoading && !movies.length ? (
        <Loading />
      ) : movies.length ? (
        <MovieGrid
          movies={movies}
          columns="grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          animated={true}
          staggerDelay={80}
          hydrateRuntime={false}
        />
      ) : (
        <p className="rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center text-sm text-gray-400">
          Current releases are temporarily unavailable. Please try again shortly.
        </p>
      )}

      <div className='flex justify-center mt-20'>
        <button
          onClick={handleNavigate}
          className="group flex items-center gap-3 px-12 py-6 bg-linear-to-r from-primary to-primary-dull
            hover:from-primary-dull hover:to-primary text-white font-semibold rounded-full shadow-lg shadow-primary/30
            hover:shadow-xl hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 border
            border-primary/30 hover:border-primary/60 relative overflow-hidden mb-5"
        >
          Show more
        </button>
      </div>
    </section>
  );
};

export default FeatureSection;
