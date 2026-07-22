import React from 'react';
import { CalendarDays } from 'lucide-react';
import CatalogCollectionPage from '../components/CatalogCollectionPage';
import { fetchUpcomingMovies } from '../services/tmdb';

const Release = () => (
  <CatalogCollectionPage
    icon={CalendarDays}
    eyebrow="Coming soon"
    title="Upcoming Releases"
    description="Preview the films arriving next and keep your watchlist ready for their first big-screen showings."
    fetchMovies={fetchUpcomingMovies}
    emptyTitle="No release dates available"
    emptyDescription="Upcoming movies will appear here."
  />
);

export default Release;
