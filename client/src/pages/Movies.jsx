import React, { useCallback, useMemo, useState } from 'react'
import { Clapperboard, LoaderCircle, Search, X } from 'lucide-react'
import { fetchPopularMovies } from '../services/tmdb'
import MovieGrid from '../components/MovieGrid'
import useSearchMovies from '../hooks/useSearchMovies'
import useCatalogFeed from '../hooks/useCatalogFeed'
import CatalogHeader from '../components/CatalogHeader'
import CatalogPageShell from '../components/CatalogPageShell'
import CatalogState from '../components/CatalogState'


const Movies = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const loadMovies = useCallback(({ signal }) => fetchPopularMovies({
    dailyRotate: true,
    dailySeedSize: 20,
    pages: 2,
    maxAdult: 2,
    signal,
    fallbackMode: 'none',
  }), []);
  const { movies, status, error, retry } = useCatalogFeed(loadMovies);

  // Search hook: handles debounce (300ms), AbortController, and caching
  const { results: searchResults, isSearching } = useSearchMovies(searchQuery);

  // Determine which movies to display: search results take priority
  const displayedMovies = useMemo(() => {
    if (searchQuery.trim().length >= 2) {
      return searchResults;
    }
    return movies;
  }, [searchQuery, searchResults, movies]);

  const trimmedQuery = searchQuery.trim();
  const hasSearchQuery = trimmedQuery.length >= 2;
  const searchStatus = isSearching
    ? 'Searching the NitroCine catalog…'
    : hasSearchQuery
      ? `${displayedMovies.length} result${displayedMovies.length === 1 ? '' : 's'} for “${trimmedQuery}”`
      : trimmedQuery.length === 1
        ? 'Type one more character to search.'
        : `${displayedMovies.length} movies ready to explore.`;

  return (
    <CatalogPageShell
      header={(
        <CatalogHeader
          icon={Clapperboard}
          eyebrow="Explore NitroCine"
          title="Now Showing"
          description="Discover audience favorites, current hits, and the next story worth seeing on the big screen."
          count={displayedMovies.length}
          countLabel="movies"
          ariaBusy={isSearching || status === 'loading'}
        >
          <div className="min-w-0">
            <div className="catalog-search relative flex min-h-13 items-center rounded-2xl border border-white/12 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 focus-within:border-primary/70 focus-within:bg-black/35 focus-within:ring-4 focus-within:ring-primary/10">
              <span className="sr-only">Search movies</span>
              <Search className="pointer-events-none absolute left-4 h-5 w-5 text-gray-400" aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search movies..."
                aria-label="Search movies"
                className="min-h-13 w-full appearance-none bg-transparent py-3 pl-12 pr-14 text-sm font-medium text-white outline-none placeholder:text-gray-400 sm:text-base [&::-webkit-search-cancel-button]:appearance-none"
            />
              {isSearching ? (
                <span className="absolute right-4 flex h-6 w-6 items-center justify-center text-primary" aria-hidden="true">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                </span>
              ) : searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                  aria-label="Clear movie search"
                  className="absolute right-1 flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
            </div>
            <p className="mt-2 min-h-5 px-1 text-xs text-gray-400" aria-live="polite">
              {searchStatus}
            </p>
          </div>
        </CatalogHeader>
      )}
    >
      {status !== 'ready' ? (
        <CatalogState status={status} error={error} onRetry={retry} />
      ) : displayedMovies.length > 0 ? (
          <MovieGrid
            movies={displayedMovies}
            columns="grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            animated={true}
            staggerDelay={30}
          />
        ) : (
          <CatalogState
            status="empty"
            emptyIcon={Search}
            emptyTitle={searchQuery.trim().length >= 2 ? 'Không tìm thấy phim phù hợp' : 'Chưa có phim để hiển thị'}
            emptyDescription={searchQuery.trim().length >= 2 ? 'Hãy thử một từ khóa khác.' : 'Hãy quay lại sau để khám phá phim mới.'}
          />
        )}
    </CatalogPageShell>
  );
};

export default Movies;
