import React, { useState, useEffect } from 'react'
import { Heart } from 'lucide-react'
import MovieGrid from '../components/MovieGrid'
import Loading from '../components/Loading'
import CatalogHeader from '../components/CatalogHeader'
import CatalogPageShell from '../components/CatalogPageShell'


const Favorite = () => {
  const [movies, setMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadFavorites = () => {
      try {
        setIsLoading(true);
        const favorites = JSON.parse(localStorage.getItem('nitro_favorites') || '[]');
        setMovies(favorites);
      } catch (error) {
        if (import.meta.env.DEV) console.warn('Error loading favorites:', error.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadFavorites();

    // Listen for cross-component favorite updates
    const handleUpdate = () => loadFavorites();
    window.addEventListener('favoritesUpdated', handleUpdate);
    return () => window.removeEventListener('favoritesUpdated', handleUpdate);
  }, []);

  if (isLoading) return <Loading />;

  return (
    <CatalogPageShell
      header={(
        <CatalogHeader
          icon={Heart}
          eyebrow="Your collection"
          title="My Favorite Movies"
          description="Keep the films you love close and return whenever you are ready to book your next screening."
          count={movies.length}
          countLabel={movies.length === 1 ? 'favorite' : 'favorites'}
        />
      )}
    >
      {movies.length > 0 ? (
            <MovieGrid
              movies={movies}
              columns="grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
              animated={true}
              staggerDelay={10}
            />
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.025] p-8 text-center sm:min-h-80 sm:p-12">
              <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <Heart className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="text-xl font-semibold text-white sm:text-2xl">Your collection is waiting</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-gray-400 sm:text-base">
                Tap the heart on any movie card and it will appear here for quick access.
              </p>
            </div>
          )}
    </CatalogPageShell>
  );
};

export default Favorite;
