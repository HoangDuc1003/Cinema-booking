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
      <MobileMovieRail title="Lựa chọn hàng đầu hôm nay cho bạn" movies={data.recommendations} />
      <MobileMovieRail title="Đang chiếu" movies={data.nowShowing} />
      <MobileMovieRail title="Phổ biến" movies={data.popular} />
      <MobileMovieRail title="Sắp ra mắt" movies={data.upcoming} viewAllPath="/releases" />
    </main>
    <MobileBottomNav />
  </div>
);

export default MobileHome;

