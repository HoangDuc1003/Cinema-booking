import React from 'react';

const HeroMedia = ({
  title,
  backdropUrl,
  mobilePosterUrl,
  posterVisible,
  videoVisible,
  children,
  onPosterError,
}) => (
  <div className={`hero-media ${videoVisible ? 'is-video-visible' : ''}`}>
    <picture className="hero-poster-shell">
      <source media="(max-width: 767px)" srcSet={mobilePosterUrl} />
      <img
        src={backdropUrl}
        alt={title}
        fetchPriority="high"
        decoding="async"
        sizes="120vw"
        onError={onPosterError}
        className={`hero-poster ${posterVisible ? 'is-visible' : 'is-dimmed'}`}
      />
    </picture>

    {children}

    <div className="hero-media__breath" aria-hidden="true" />
    <div className="hero-media__gradient hero-media__gradient--side" aria-hidden="true" />
    <div className="hero-media__gradient hero-media__gradient--bottom" aria-hidden="true" />
    <div className="hero-media__gradient hero-media__gradient--vignette" aria-hidden="true" />
  </div>
);

export default React.memo(HeroMedia);
