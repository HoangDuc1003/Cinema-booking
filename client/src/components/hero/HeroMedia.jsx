import React, { useState } from 'react';

const HeroMedia = ({
  title,
  posterCandidates = [],
  posterVisible,
  videoVisible,
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
    <div className={`hero-media ${videoVisible ? 'is-video-visible' : ''}`}>
      <div className={`hero-poster-shell ${currentSource ? '' : 'is-fallback'}`}>
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
            className={`hero-poster ${imageReady ? 'is-ready' : 'is-loading'} ${posterVisible ? 'is-visible' : 'is-dimmed'}`}
          />
        )}
      </div>

      {children}

      <div className="hero-media__breath" aria-hidden="true" />
      <div className="hero-media__gradient hero-media__gradient--side" aria-hidden="true" />
      <div className="hero-media__gradient hero-media__gradient--bottom" aria-hidden="true" />
      <div className="hero-media__gradient hero-media__gradient--vignette" aria-hidden="true" />
    </div>
  );
};

export default React.memo(HeroMedia);
