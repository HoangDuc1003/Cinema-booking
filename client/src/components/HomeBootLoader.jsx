import React from 'react';
import './homeBootLoader.css';

const HomeBootLoader = ({ exiting = false, fadeMs = 450 }) => (
  <div
    className={`home-boot-loader home-entry-loader ${exiting ? 'is-exiting' : ''}`.trim()}
    data-testid="home-entry-loader"
    style={{ '--home-boot-fade-ms': `${fadeMs}ms` }}
    role="status"
    aria-live="polite"
    aria-atomic="true"
    aria-label="Loading NitroCine"
  >
    <div className="home-boot-loader__content">
      <div className="home-boot-loader__spinner" aria-hidden="true" />
      <p className="home-boot-loader__message">Loading</p>
    </div>
  </div>
);

export default React.memo(HomeBootLoader);
