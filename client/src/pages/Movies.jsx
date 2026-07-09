import React, { useState, useEffect, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { fetchPopularMovies } from '../services/tmdb'
import MovieGrid from '../components/MovieGrid'
import BlurCircle from '../components/BlurCircle'
import Loading from '../components/Loading'
import useSearchMovies from '../hooks/useSearchMovies'
import { dummyShowsData } from '../assets/assets'


const Movies = () => {
  const [movies, setMovies] = useState(() => dummyShowsData);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Search hook: handles debounce (300ms), AbortController, and caching
  const { results: searchResults, isSearching } = useSearchMovies(searchQuery);

  useEffect(() => {
    let mounted = true;

    const loadMovies = async () => {
      try {
        const data = await fetchPopularMovies({ dailyRotate: true, dailySeedSize: 20, pages: 2, maxAdult: 2 });
        if (mounted) {
          setMovies(Array.isArray(data) && data.length ? data : dummyShowsData);
        }
      } catch (error) {
        console.error("No movies available", error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadMovies();
    return () => { mounted = false; };
  }, []);

  // Determine which movies to display: search results take priority
  const displayedMovies = useMemo(() => {
    if (searchQuery.trim().length >= 2) {
      return searchResults;
    }
    return movies;
  }, [searchQuery, searchResults, movies]);

  const pageTitle = searchQuery.trim().length >= 2
    ? `Results for "${searchQuery}"`
    : 'Now Showing';

  if (isLoading && !movies.length) return <Loading />;

  return (
    <div className='relative pt-30 pb-5 px-6 md:px-16 lg:px-40 xl:px-44 min-h-[100vh]'>
      {/* Animated glow band — moved animation to index.css */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[150%] h-45 rounded-[100%] blur-[120px] 
          animate-slow-pulse pointer-events-none"
        style={{ top: '-20px', zIndex: 0, background: 'rgba(0, 123, 255, 0.5)' }}
      />

      <BlurCircle top='150px' left='0' />
      <BlurCircle bottom='50px' right='50px' />
      <BlurCircle top='50px' left='400px' />
      <BlurCircle top='100px' right='0' />

      <div className="relative z-10">
        <h1 className='text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-8'>
          {pageTitle}
        </h1>

        {/* Search bar */}
        <div className="relative max-w-xl mb-12">
          <div className="relative flex items-center">
            <Search className="absolute left-4 w-5 h-5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search movies..."
              className="w-full pl-12 pr-12 py-3.5 bg-white/5 border border-white/10 rounded-2xl 
                text-white placeholder-gray-500 focus:outline-none focus:border-[#F84565]/50 
                focus:bg-white/8 backdrop-blur-sm transition-all duration-300
                text-base font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 p-1 rounded-full hover:bg-white/10 transition-colors duration-200"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
          {/* Search indicator */}
          {isSearching && (
            <div className="absolute -bottom-6 left-4 text-xs text-gray-500 flex items-center gap-2">
              <div className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />
              Searching...
            </div>
          )}
        </div>

        {displayedMovies.length > 0 ? (
          <MovieGrid movies={displayedMovies} animated={true} staggerDelay={10} />
        ) : (
          <div className='min-h-[40vh] flex items-center justify-center'>
            <p className='text-xl font-medium text-gray-400'>
              {searchQuery.trim().length >= 2
                ? 'No movies found. Try a different search.'
                : 'No movies available'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Movies;
