import React from 'react';
import HeroNativeVideo from './HeroNativeVideo';

const HeroVideoRenderer = ({
  source,
  enabled,
  active,
  visible,
  generation,
  muted,
  volume = 60,
  onPlayerReady,
  onPlaybackRequested,
  onPlaybackPlaying,
  onPlaybackStable,
  onVisualReady,
  onVisualHidden,
  onPlaybackPaused,
  onBufferingSustained,
  onAutoplayBlocked,
  onMutedFallback,
  onEnded,
  onFailure,
}) => {
  const commonProps = {
    enabled,
    active,
    visible,
    generation,
    muted,
    volume,
    onPlayerReady,
    onPlaybackRequested,
    onPlaybackPlaying,
    onPlaybackStable,
    onVisualReady,
    onVisualHidden,
    onPlaybackPaused,
    onBufferingSustained,
    onAutoplayBlocked,
    onMutedFallback,
    onEnded,
    onFailure,
  };

  if (source?.kind === 'native' && source.src) {
    return <HeroNativeVideo {...commonProps} source={source} />;
  }

  return null;
};

export default React.memo(HeroVideoRenderer);
