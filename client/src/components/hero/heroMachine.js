export const HERO_PHASES = Object.freeze({
  POSTER: 'poster',
  TRAILER_LOADING: 'trailerLoading',
  TRAILER_ENTERING: 'trailerEntering',
  TRAILER_EXPANDED: 'trailerExpanded',
  TRAILER_COMPACT: 'trailerCompact',
  TRAILER_FAILED: 'trailerFailed',
});

export const HERO_FAILURE_REASONS = Object.freeze({
  AUTOPLAY_BLOCKED: 'autoplay-blocked',
  TIMEOUT: 'timeout',
  VIDEO_ERROR: 'video-error',
  UNSAFE_VIDEO_FRAME: 'unsafe-video-frame',
  YOUTUBE_ERROR: 'youtube-error',
  MISSING_VIDEO: 'missing-video',
});

export const HERO_COMPACT_PLAYBACK_MS = 3_000;
export const HERO_PREVIEW_PLAYBACK_MS = 20_000;
export const HERO_BUFFERING_HYSTERESIS_MS = 450;
export const HERO_PLAYING_HYSTERESIS_MS = 250;
export const HERO_VISUAL_READY_CONFIRM_MS = 350;
export const HERO_PLAYBACK_TIMEOUT_MS = 8_000;

export const createInitialHeroState = ({ movieKey = '', generation = 0 } = {}) => ({
  phase: HERO_PHASES.POSTER,
  generation,
  movieKey,
  videoSource: null,
  failureReason: null,
  failureDetail: null,
  retryCount: 0,
  posterVisible: true,
  overviewRevealed: true,
  hasCompacted: false,
  playbackStartedAt: null,
  compactRemainingMs: HERO_COMPACT_PLAYBACK_MS,
  previewRemainingMs: HERO_PREVIEW_PLAYBACK_MS,
});

const isStale = (state, action) => (
  action.generation != null && action.generation !== state.generation
);

const spendPlayback = (state, now) => {
  if (state.playbackStartedAt == null || !Number.isFinite(now)) return state;
  const elapsed = Math.max(0, now - state.playbackStartedAt);
  return {
    ...state,
    playbackStartedAt: null,
    compactRemainingMs: Math.max(0, state.compactRemainingMs - elapsed),
    previewRemainingMs: Math.max(0, state.previewRemainingMs - elapsed),
  };
};

export const getPlaybackRemaining = (state, now) => {
  if (state.playbackStartedAt == null || !Number.isFinite(now)) {
    return {
      compactRemainingMs: state.compactRemainingMs,
      previewRemainingMs: state.previewRemainingMs,
    };
  }

  const elapsed = Math.max(0, now - state.playbackStartedAt);
  return {
    compactRemainingMs: Math.max(0, state.compactRemainingMs - elapsed),
    previewRemainingMs: Math.max(0, state.previewRemainingMs - elapsed),
  };
};

export const isExpectedPlayback = ({
  eventGeneration,
  currentGeneration,
  playerState,
  playingState,
  currentTime,
  startSeconds,
  toleranceBefore = 0.75,
  toleranceAfter = 3,
}) => (
  eventGeneration === currentGeneration
  && playerState === playingState
  && Number.isFinite(currentTime)
  && currentTime >= Math.max(0, startSeconds - toleranceBefore)
  && currentTime <= startSeconds + toleranceAfter
);

export const hasReachedHysteresis = (elapsedMs, thresholdMs) => (
  Number.isFinite(elapsedMs) && elapsedMs >= thresholdMs
);

export const hasAdvancedPlayback = ({
  playerState,
  playingState,
  previousTime,
  currentTime,
}) => (
  playerState === playingState
  && Number.isFinite(previousTime)
  && Number.isFinite(currentTime)
  && currentTime > previousTime
);

export const heroReducer = (state, action) => {
  switch (action.type) {
    case 'MOVIE_CHANGED':
    case 'POSTER_REQUESTED':
    case 'BELOW_LG':
    case 'RESET':
      return createInitialHeroState({
        movieKey: action.movieKey ?? state.movieKey,
        generation: action.generation ?? state.generation + 1,
      });

    case 'TRAILER_REQUESTED':
      return {
        ...createInitialHeroState({
          movieKey: action.movieKey ?? state.movieKey,
          generation: action.generation ?? state.generation + 1,
        }),
        phase: HERO_PHASES.TRAILER_LOADING,
        retryCount: action.retryCount ?? state.retryCount,
      };

    case 'TRAILER_METADATA_RESOLVED':
      if (isStale(state, action)) return state;
      return {
        ...state,
        videoSource: action.videoSource,
        failureReason: null,
        failureDetail: null,
      };

    case 'PLAYBACK_STABLE': {
      if (isStale(state, action) || state.phase === HERO_PHASES.TRAILER_FAILED) return state;
      const isFirstConfirmation = ![
        HERO_PHASES.TRAILER_ENTERING,
        HERO_PHASES.TRAILER_EXPANDED,
        HERO_PHASES.TRAILER_COMPACT,
      ].includes(state.phase);

      return {
        ...state,
        phase: isFirstConfirmation ? HERO_PHASES.TRAILER_ENTERING : state.phase,
        playbackStartedAt: state.playbackStartedAt ?? action.now,
      };
    }

    case 'VISUAL_READY':
      if (
        isStale(state, action)
        || state.phase === HERO_PHASES.TRAILER_FAILED
        || ![
          HERO_PHASES.TRAILER_ENTERING,
          HERO_PHASES.TRAILER_EXPANDED,
          HERO_PHASES.TRAILER_COMPACT,
        ].includes(state.phase)
      ) return state;
      return { ...state, posterVisible: false };

    case 'VISUAL_HIDDEN':
      if (isStale(state, action) || state.posterVisible) return state;
      return { ...state, posterVisible: true };

    case 'PLAYBACK_RESUMED':
      if (
        isStale(state, action)
        || state.phase === HERO_PHASES.TRAILER_FAILED
        || state.playbackStartedAt != null
        || !Number.isFinite(action.now)
      ) return state;
      return { ...state, playbackStartedAt: action.now };

    case 'VIDEO_ENTERED':
      if (isStale(state, action) || state.phase !== HERO_PHASES.TRAILER_ENTERING) return state;
      return { ...state, phase: HERO_PHASES.TRAILER_EXPANDED };

    case 'PLAYBACK_PAUSED':
      if (isStale(state, action)) return state;
      return spendPlayback(state, action.now);

    case 'BUFFERING_SUSTAINED':
      if (isStale(state, action)) return state;
      return { ...state, posterVisible: true };

    case 'COMPACT_ELAPSED': {
      if (isStale(state, action)) return state;
      const spent = spendPlayback(state, action.now);
      return {
        ...spent,
        phase: HERO_PHASES.TRAILER_COMPACT,
        compactRemainingMs: 0,
        overviewRevealed: false,
        hasCompacted: true,
        playbackStartedAt: state.playbackStartedAt == null ? null : action.now,
      };
    }

    case 'PREVIEW_ELAPSED': {
      if (isStale(state, action)) return state;
      const spent = spendPlayback(state, action.now);
      return {
        ...spent,
        previewRemainingMs: 0,
        playbackStartedAt: state.playbackStartedAt == null ? null : action.now,
      };
    }

    case 'REVEAL_OVERVIEW':
      if (isStale(state, action) || state.phase !== HERO_PHASES.TRAILER_COMPACT) return state;
      return { ...state, overviewRevealed: true };

    case 'HIDE_OVERVIEW':
      if (isStale(state, action) || state.phase !== HERO_PHASES.TRAILER_COMPACT) return state;
      return { ...state, overviewRevealed: false };

    case 'TRAILER_FAILED': {
      if (isStale(state, action)) return state;
      const spent = spendPlayback(state, action.now);
      return {
        ...spent,
        phase: HERO_PHASES.TRAILER_FAILED,
        failureReason: action.reason,
        failureDetail: action.detail ?? null,
        retryCount: action.retryCount ?? state.retryCount,
        posterVisible: true,
        overviewRevealed: true,
        playbackStartedAt: null,
      };
    }

    default:
      return state;
  }
};

export default heroReducer;
