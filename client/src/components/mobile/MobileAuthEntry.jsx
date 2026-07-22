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
      <span className="mobile-auth-entry__eyebrow">Cinema at your fingertips</span>
      <h1 id="mobile-auth-title">A memorable story, every night.</h1>
      <p>Discover new movies, choose a showtime, and reserve the perfect seats for your night out.</p>
      <button type="button" onClick={onSignIn} className="mobile-primary-button">
        Sign in to continue
        <ArrowRight aria-hidden="true" />
      </button>
    </section>
  </main>
);

export default MobileAuthEntry;
