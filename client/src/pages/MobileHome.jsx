import React from 'react';
import MobileBottomNav from '../components/mobile/MobileBottomNav';
import MobileCategoryChips from '../components/mobile/MobileCategoryChips';
import MobileFeaturedCard from '../components/mobile/MobileFeaturedCard';
import MobileMovieRail from '../components/mobile/MobileMovieRail';
import MobileTopBar from '../components/mobile/MobileTopBar';
import '../styles/mobile-app.css';

const MobileHome = ({ data }) => (
  <div className="mobile-app-home" data-testid="mobile-home">
    <MobileTopBar />
    <main>
      <MobileCategoryChips />
      <MobileFeaturedCard movie={data.featured} />
      {data.error && <p className="mobile-home-error" role="status">{data.error}</p>}
      <MobileMovieRail title="Today's top picks for you" movies={data.recommendations} />
      <MobileMovieRail title="Now showing" movies={data.nowShowing} />
      <MobileMovieRail title="Popular" movies={data.popular} />
      <MobileMovieRail title="Coming soon" movies={data.upcoming} viewAllPath="/releases" />
    </main>
    <MobileBottomNav />
  </div>
);

export default MobileHome;
