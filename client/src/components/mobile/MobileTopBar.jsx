import React, { useEffect, useState } from 'react';
import { Search, Ticket } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { assets } from '../../assets/assets';
import { useProfiles } from '../../context/ProfileContext';
import ProfileAvatar from './ProfileAvatar';

const MobileTopBar = () => {
  const navigate = useNavigate();
  const { activeProfile, switchProfile } = useProfiles();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrolled(window.scrollY > 24));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
    };
  }, []);

  return (
    <header className={`mobile-top-bar ${scrolled ? 'is-scrolled' : ''}`} data-testid="mobile-top-bar">
      <button type="button" className="mobile-brand-button" onClick={() => navigate('/')} aria-label="NitroCine home">
        <img src={assets.logo} alt="" />
        <span>Home</span>
      </button>
      <nav aria-label="Quick actions">
        <button type="button" className="mobile-icon-button" onClick={() => navigate('/movies')} aria-label="Search movies"><Search /></button>
        <button type="button" className="mobile-icon-button" onClick={() => navigate('/my-bookings')} aria-label="My tickets"><Ticket /></button>
        <button type="button" className="mobile-profile-button" onClick={switchProfile} aria-label="Switch profile">
          <ProfileAvatar avatarId={activeProfile?.avatarId} name={activeProfile?.name} />
        </button>
      </nav>
    </header>
  );
};

export default MobileTopBar;
