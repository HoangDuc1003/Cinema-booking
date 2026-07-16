import React from 'react';
import { Home, Search, Ticket, UserRound } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProfiles } from '../../context/ProfileContext';

const MobileBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { switchProfile } = useProfiles();
  const items = [
    { label: 'Trang chủ', path: '/', icon: Home },
    { label: 'Tìm kiếm', path: '/movies', icon: Search },
    { label: 'Vé của tôi', path: '/my-bookings', icon: Ticket },
  ];
  return (
    <nav className="mobile-bottom-nav" aria-label="Điều hướng chính" data-testid="mobile-bottom-nav">
      {items.map(({ label, path, icon: Icon }) => {
        const active = location.pathname === path;
        return (
          <button type="button" key={path} onClick={() => navigate(path)} aria-current={active ? 'page' : undefined} className={active ? 'is-active' : ''}>
            <Icon aria-hidden="true" /><span>{label}</span>
          </button>
        );
      })}
      <button type="button" onClick={switchProfile}><UserRound aria-hidden="true" /><span>Hồ sơ</span></button>
    </nav>
  );
};

export default MobileBottomNav;
