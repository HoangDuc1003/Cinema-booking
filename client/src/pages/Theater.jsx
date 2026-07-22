import React from 'react';
import { Film } from 'lucide-react';
import CatalogCollectionPage from '../components/CatalogCollectionPage';
import { fetchNowPlayingMovies } from '../services/tmdb';

const Theater = () => (
  <CatalogCollectionPage
    icon={Film}
    eyebrow="Playing now"
    title="Now in Theaters"
    description="Browse films currently lighting up the big screen and choose the next showtime for your cinema night."
    fetchMovies={fetchNowPlayingMovies}
    emptyTitle="No showtimes available"
    emptyDescription="The theater schedule will be updated soon."
  />
);

export default Theater;
