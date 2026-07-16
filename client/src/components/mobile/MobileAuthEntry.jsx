import React from 'react';
import { assets } from '../../assets/assets';

const MobileAuthEntry = ({ onSignIn }) => (
  <main className="mobile-auth-entry" data-testid="mobile-auth-entry">
    <img className="mobile-auth-entry__backdrop" src={assets.backgroundImage} alt="" />
    <div className="mobile-auth-entry__shade" />
    <div className="mobile-auth-entry__content">
      <img src={assets.logo} alt="NitroCine" className="mobile-auth-entry__logo" />
      <p>Khám phá phim mới, chọn suất chiếu và đặt chỗ cho buổi tối của bạn.</p>
      <button type="button" onClick={onSignIn} className="mobile-primary-button">
        Đăng nhập
      </button>
    </div>
  </main>
);

export default MobileAuthEntry;

