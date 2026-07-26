import React from 'react';
import HeroYouTubeVideo from './HeroYouTubeVideo';
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

  if (source?.kind === 'youtube' && source.videoId) {
    return <HeroYouTubeVideo {...commonProps} videoId={source.videoId} startSeconds={source.startSeconds ?? 15} />;
  }
  
  if (source?.kind === 'native' && source.src) {
    return <HeroNativeVideo {...commonProps} src={source.src} mimeType={source.mimeType} />;
  }

  return null;
};

export default React.memo(HeroVideoRenderer);
