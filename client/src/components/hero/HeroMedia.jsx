import React, { useState } from 'react';

const HeroMedia = ({
  title,
  posterCandidates = [],
  posterVisible,
  videoVisible,
  cinematicBackgroundActive,
  ambientImageUrl,
  movieId,
  children,
}) => {
  const candidates = [...new Set(posterCandidates.filter(Boolean))];
  const candidateKey = candidates.join('|');
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [imageReady, setImageReady] = useState(false);

  const currentSource = candidates[candidateIndex] || '';
  const handleImageError = () => {
    setImageReady(false);
    setCandidateIndex((index) => Math.min(index + 1, candidates.length));
  };

  return (
    <div className={`hero-media ${videoVisible ? 'is-video-visible' : ''}`} data-trailer-active={videoVisible ? 'true' : 'false'}>
      <div
        className="hero-ambient"
        data-active={cinematicBackgroundActive ? 'true' : 'false'}
        aria-hidden="true"
      >
        {ambientImageUrl && (
          <img
            key={movieId ?? ambientImageUrl}
            className="hero-ambient__image"
            src={ambientImageUrl}
            alt=""
            decoding="async"
            draggable="false"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        )}

        <div className="hero-ambient__overlay" />
      </div>

      <div className={`hero-poster-shell ${currentSource ? '' : 'is-fallback'} ${posterVisible ? 'is-visible' : 'is-hidden'}`}>
        {currentSource && (
          <img
            key={`${candidateKey}-${candidateIndex}`}
            src={currentSource}
            alt={title}
            fetchPriority="high"
            decoding="async"
            sizes="100vw"
            onLoad={() => setImageReady(true)}
            onError={handleImageError}
            className={`hero-poster ${imageReady ? 'is-ready' : 'is-loading'}`}
          />
        )}
      </div>

      <div className="hero-trailer-layer">
        {children}
      </div>

      <div className="hero-media__breath" aria-hidden="true" />
      <div className="hero-media__gradient hero-media__gradient--side" aria-hidden="true" />
      <div className="hero-media__gradient hero-media__gradient--bottom" aria-hidden="true" />
      <div className="hero-media__gradient hero-media__gradient--vignette" aria-hidden="true" />
    </div>
  );
};

export default React.memo(HeroMedia);
