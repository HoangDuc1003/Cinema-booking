import React from 'react';
import { ArrowRight } from 'lucide-react';
import { assets } from '../../assets/assets';

const MobileAuthEntry = ({ onSignIn }) => (
  <main className="mobile-auth-entry" data-testid="mobile-auth-entry">
    <img className="mobile-auth-entry__backdrop" src={assets.backgroundImage} alt="" />
    <div className="mobile-auth-entry__shade" />
    <div className="mobile-auth-entry__brand">
      <img src={assets.logo} alt="NitroCine" className="mobile-auth-entry__logo" />
    </div>
    <section className="mobile-auth-entry__content" aria-labelledby="mobile-auth-title">
      <span className="mobile-auth-entry__eyebrow">Rạp phim trong tầm tay</span>
      <h1 id="mobile-auth-title">Mỗi tối, một câu chuyện đáng nhớ.</h1>
      <p>Khám phá phim mới, chọn suất chiếu và đặt chỗ cho buổi tối của bạn.</p>
      <button type="button" onClick={onSignIn} className="mobile-primary-button">
        Đăng nhập để tiếp tục
        <ArrowRight aria-hidden="true" />
      </button>
    </section>
  </main>
);

export default MobileAuthEntry;
