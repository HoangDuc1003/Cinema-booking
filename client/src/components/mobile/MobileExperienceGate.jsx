import React from 'react';
import { useLocation } from 'react-router-dom';
import { ProfileProvider, useProfiles } from '../../context/ProfileContext';
import useMobileHomeData from '../../hooks/useMobileHomeData';
import MobileHome from '../../pages/MobileHome';
import MobileAuthEntry from './MobileAuthEntry';
import MobileBottomNav from './MobileBottomNav';
import MobileTopBar from './MobileTopBar';
import ProfileLaunchScreen from './ProfileLaunchScreen';
import ProfilePicker from './ProfilePicker';
import '../../styles/mobile-app.css';

const MobileGateContent = ({ children }) => {
  const location = useLocation();
  const {
    activeProfile,
    authLoaded,
    finishLaunch,
    isLoading,
    isSignedIn,
    openSignIn,
    pendingLaunch,
  } = useProfiles();
  const homeData = useMobileHomeData({ enabled: isSignedIn && Boolean(activeProfile) });

  if (!authLoaded) {
    return <div className="mobile-gate-status" role="status">Đang khởi động NitroCine…</div>;
  }
  if (!isSignedIn) return <MobileAuthEntry onSignIn={openSignIn} />;
  if (isLoading) return <div className="mobile-gate-status" role="status">Đang tải hồ sơ…</div>;
  if (!activeProfile) return <ProfilePicker />;
  if (pendingLaunch) {
    return <ProfileLaunchScreen profile={pendingLaunch} criticalReady={homeData.criticalReady} onComplete={finishLaunch} />;
  }
  if (location.pathname === '/') return <MobileHome data={homeData} />;

  const isCatalogRoute = ['/movies', '/theater', '/releases', '/favorite'].includes(location.pathname);

  return (
    <div className="mobile-secondary-shell">
      <MobileTopBar />
      <main className={isCatalogRoute ? 'mobile-catalog-main' : ''}>{children}</main>
      <MobileBottomNav />
    </div>
  );
};

const MobileExperienceGate = ({ children }) => (
  <ProfileProvider>
    <MobileGateContent>{children}</MobileGateContent>
  </ProfileProvider>
);

export default MobileExperienceGate;
