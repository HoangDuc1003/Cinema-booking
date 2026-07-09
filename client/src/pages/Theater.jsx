import React, { useState, useEffect } from 'react'
import { fetchNowPlayingMovies } from '../services/tmdb'
import BlurCircle from '../components/BlurCircle'
import Loading from '../components/Loading'
import MovieGrid from '../components/MovieGrid'
import { dummyShowsData } from '../assets/assets'
  
const Theater = () => {
  const [movies, setMovies] = useState(() => dummyShowsData.slice(0, 10));
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadMovies = async () => {
      try {
        const data = await fetchNowPlayingMovies();
        setMovies(Array.isArray(data) && data.length ? data : dummyShowsData.slice(0, 10));
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    loadMovies();
  }, []);

  if (isLoading && !movies.length) return <Loading />;

  return (
    <div className='relative pt-30 pb-10 px-6 md:px-16 lg:px-40 xl:px-44 overflow-hidden min-h-[100vh]'>
      {/* Blue glow band */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[150%] h-45 rounded-[100%] blur-[120px] animate-slow-pulse pointer-events-none"
        style={{ top: '-20px', zIndex: 0, background: 'rgba(0, 123, 255, 0.5)' }}
      />
      <BlurCircle top='150px' left='0'/>
      <BlurCircle bottom='50px' right='50px'/>
      <h1 className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-20'>Now in Theaters</h1>
      <MovieGrid movies={movies} animated={true} staggerDelay={20} />
    </div>
  );
}

export default Theater;
