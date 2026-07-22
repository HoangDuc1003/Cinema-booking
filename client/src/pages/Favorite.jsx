import React, { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import MovieGrid from '../components/MovieGrid'
import CatalogHeader from '../components/CatalogHeader'
import CatalogPageShell from '../components/CatalogPageShell'
import CatalogState from '../components/CatalogState'


const readFavorites = () => {
  try {
    const value = JSON.parse(localStorage.getItem('nitro_favorites') || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const Favorite = () => {
  const [movies, setMovies] = useState(readFavorites);

  useEffect(() => {
    // Listen for cross-component favorite updates
    const handleUpdate = () => setMovies(readFavorites());
    window.addEventListener('favoritesUpdated', handleUpdate);
    return () => window.removeEventListener('favoritesUpdated', handleUpdate);
  }, []);

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
              staggerDelay={30}
            />
          ) : (
            <CatalogState
              status="empty"
              emptyIcon={Heart}
              emptyTitle="Bộ sưu tập đang chờ bạn"
              emptyDescription="Chạm vào biểu tượng trái tim trên thẻ phim để lưu phim yêu thích tại đây."
            />
          )}
    </CatalogPageShell>
  );
};

export default Favorite;
