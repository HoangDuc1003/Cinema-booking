import React from 'react';
import HeroNativeVideo from './HeroNativeVideo';
import HeroYouTubeVideo from './HeroYouTubeVideo';

const HeroVideoRenderer = ({
  source,
  enabled,
  active,
  visible,
  generation,
  muted,
  onPlayerReady,
  onPlaybackRequested,
  onPlaybackPlaying,
  onPlaybackStable,
  onVisualReady,
  onVisualHidden,
  onPlaybackPaused,
  onBufferingSustained,
  onEnded,
  onFailure,
}) => {
  const commonProps = {
    enabled,
    active,
    visible,
    generation,
    muted,
    onPlayerReady,
    onPlaybackRequested,
    onPlaybackPlaying,
    onPlaybackStable,
    onVisualReady,
    onVisualHidden,
    onPlaybackPaused,
    onBufferingSustained,
    onEnded,
    onFailure,
  };

  if (source?.kind === 'native' && source.src) {
    return <HeroNativeVideo {...commonProps} source={source} />;
  }

  if (source?.kind === 'youtube' && source.videoId) {
    return <HeroYouTubeVideo {...commonProps} videoId={source.videoId} />;
  }

  return null;
};

export default React.memo(HeroVideoRenderer);
