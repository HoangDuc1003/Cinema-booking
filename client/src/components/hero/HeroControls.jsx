import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';

const HeroControls = ({
  muted,
  onToggleMuted,
}) => {
  return (
    <button
      type="button"
      onClick={onToggleMuted}
      aria-label={muted ? 'Turn trailer sound on' : 'Mute trailer'}
      aria-pressed={!muted}
      className="hero-control hero-control--icon"
    >
      {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
    </button>
  );
};

export default React.memo(HeroControls);
