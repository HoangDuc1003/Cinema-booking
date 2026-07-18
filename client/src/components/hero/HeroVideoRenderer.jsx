import React from 'react';
import HeroYouTubeVideo from './HeroYouTubeVideo';

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

  if (source?.kind === 'youtube' && source.videoId) {
    return <HeroYouTubeVideo {...commonProps} videoId={source.videoId} startSeconds={source.startSeconds ?? 15} />;
  }

  return null;
};

export default React.memo(HeroVideoRenderer);
