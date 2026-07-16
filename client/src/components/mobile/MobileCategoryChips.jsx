import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const CHIPS = [
  { label: 'Đang chiếu', path: '/movies' },
  { label: 'Phim', path: '/movies' },
  { label: 'Sắp ra mắt', path: '/releases' },
];

const MobileCategoryChips = () => {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <nav className="mobile-category-chips" aria-label="Danh mục phim">
      {CHIPS.map((chip) => (
        <button
          type="button"
          key={`${chip.label}-${chip.path}`}
          className={location.pathname === chip.path ? 'is-active' : ''}
          onClick={() => navigate(chip.path)}
        >
          {chip.label}
        </button>
      ))}
    </nav>
  );
};

export default MobileCategoryChips;

