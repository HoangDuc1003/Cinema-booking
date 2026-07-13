import React from 'react';
import { ImageIcon, Video, Volume2, VolumeX } from 'lucide-react';

const HeroControls = ({
  trailerActive,
  trailerLoading,
  trailerFailed,
  retryExhausted,
  muted,
  onToggleMuted,
  onToggleTrailer,
}) => {
  const label = trailerActive ? 'Poster' : trailerFailed ? retryExhausted ? 'Unavailable' : 'Retry' : 'Trailer';

  return (
    <div className="hero-controls">
      {trailerActive && (
        <button
          type="button"
          onClick={onToggleMuted}
          aria-label={muted ? 'Turn trailer sound on' : 'Mute trailer'}
          aria-pressed={!muted}
          className="hero-control hero-control--icon"
        >
          {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </button>
      )}
      <button
        type="button"
        onClick={onToggleTrailer}
        disabled={trailerLoading || retryExhausted}
        aria-busy={trailerLoading}
        aria-label={trailerActive ? 'Show hero poster' : trailerFailed ? retryExhausted ? 'Hero trailer unavailable' : 'Retry hero trailer' : 'Play hero trailer'}
        className="hero-control"
      >
        {trailerActive ? <ImageIcon aria-hidden="true" /> : <Video aria-hidden="true" />}
        <span>{label}</span>
      </button>
    </div>
  );
};

export default React.memo(HeroControls);
