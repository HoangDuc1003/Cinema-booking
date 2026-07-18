export const HERO_PHASES = Object.freeze({
  POSTER: 'poster',
  TRAILER_LOADING: 'trailerLoading',
  TRAILER_ENTERING: 'trailerEntering',
  TRAILER_EXPANDED: 'trailerExpanded',
  TRAILER_COMPACT: 'trailerCompact',
  TRAILER_FAILED: 'trailerFailed',
});

export const HERO_METADATA_STATUS = Object.freeze({
  IDLE: 'idle',
  REQUESTING: 'requesting',
  RESOLVED: 'resolved',
  MISSING: 'missing',
  FAILED: 'failed',
});

export const HERO_PLAYER_STATUS = Object.freeze({
  DISABLED: 'disabled',
  INITIALIZING: 'initializing',
  READY: 'ready',
});

export const HERO_PLAYBACK_STATUS = Object.freeze({
  IDLE: 'idle',
  REQUESTED: 'requested',
  PLAYING: 'playing',
  STABLE: 'stable',
  PAUSED: 'paused',
  FAILED: 'failed',
});

export const HERO_AUDIO_STATUS = Object.freeze({
  PREFERRED_ON: 'preferred-on',
  PREFERRED_OFF: 'preferred-off',
  SOUND_ACTIVE: 'sound-active',
  MUTED_ACTIVE: 'muted-active',
  AUTOPLAY_SOUND_BLOCKED: 'autoplay-sound-blocked',
});

export const HERO_FAILURE_REASONS = Object.freeze({
  AUTOPLAY_BLOCKED: 'autoplay-blocked',
  TIMEOUT: 'timeout',
  VIDEO_ERROR: 'video-error',
  UNSAFE_VIDEO_FRAME: 'unsafe-video-frame',
  YOUTUBE_API_ERROR: 'youtube-api-error',
  YOUTUBE_INVALID_PARAMETER: 'youtube-invalid-parameter',
  YOUTUBE_HTML5_ERROR: 'youtube-html5-error',
  YOUTUBE_NOT_FOUND: 'youtube-not-found',
  YOUTUBE_EMBEDDING_BLOCKED: 'youtube-embedding-blocked',
  MISSING_VIDEO: 'missing-video',
});

export const HERO_PREVIEW_PLAYBACK_MS = 50_000;
export const HERO_COMPACT_PLAYBACK_MS = 5_000;
export const HERO_BUFFERING_HYSTERESIS_MS = 450;
export const HERO_PLAYING_HYSTERESIS_MS = 250;
// Minimum quarantine after PLAYING + currentTime samples confirm real playback.
// YouTube may briefly render transient center bezels after programmatic playback;
// the poster stays above the player until this quarantine has elapsed AND samples
// show continuous currentTime advancement without buffering.
export const HERO_VISUAL_READY_CONFIRM_MS = 2_000;
export const HERO_PLAYBACK_TIMEOUT_MS = 5_000;

export const createInitialHeroState = ({ movieKey = '', generation = 0, audioPreference = HERO_AUDIO_STATUS.PREFERRED_ON } = {}) => ({
  phase: HERO_PHASES.POSTER,
  generation,
  movieKey,
  videoSource: null,
  metadataStatus: HERO_METADATA_STATUS.IDLE,
  playerStatus: HERO_PLAYER_STATUS.DISABLED,
  playbackStatus: HERO_PLAYBACK_STATUS.IDLE,
  audioStatus: audioPreference,
  visualReady: false,
  failureReason: null,
  failureDetail: null,
  retryCount: 0,
  posterVisible: true,
  overviewRevealed: true,
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

const isPlaybackPhase = (phase) => [
  HERO_PHASES.TRAILER_LOADING,
  HERO_PHASES.TRAILER_ENTERING,
  HERO_PHASES.TRAILER_EXPANDED,
  HERO_PHASES.TRAILER_COMPACT,
].includes(phase);

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
        metadataStatus: HERO_METADATA_STATUS.REQUESTING,
        retryCount: action.retryCount ?? state.retryCount,
      };

    case 'TRAILER_METADATA_RESOLVED':
      if (isStale(state, action) || state.phase !== HERO_PHASES.TRAILER_LOADING) return state;
      return {
        ...state,
        videoSource: action.videoSource,
        metadataStatus: HERO_METADATA_STATUS.RESOLVED,
        failureReason: null,
        failureDetail: null,
      };

    case 'PLAYER_INITIALIZING':
      if (isStale(state, action) || !state.videoSource || !isPlaybackPhase(state.phase)) return state;
      return { ...state, playerStatus: HERO_PLAYER_STATUS.INITIALIZING };

    case 'PLAYER_DISABLED':
      if (isStale(state, action) || !isPlaybackPhase(state.phase)) return state;
      return { ...state, playerStatus: HERO_PLAYER_STATUS.DISABLED };

    case 'PLAYER_READY':
      if (isStale(state, action) || !state.videoSource || !isPlaybackPhase(state.phase)) return state;
      return { ...state, playerStatus: HERO_PLAYER_STATUS.READY };

    case 'PLAYBACK_REQUESTED':
      if (isStale(state, action) || !state.videoSource || !isPlaybackPhase(state.phase)) return state;
      return { ...state, playbackStatus: HERO_PLAYBACK_STATUS.REQUESTED };

    case 'PLAYBACK_PLAYING':
    case 'PLAYBACK_RESUMED':
      if (isStale(state, action) || state.phase === HERO_PHASES.TRAILER_FAILED) return state;
      return { ...state, playbackStatus: HERO_PLAYBACK_STATUS.PLAYING };

    case 'PLAYBACK_STABLE': {
      if (isStale(state, action) || state.phase === HERO_PHASES.TRAILER_FAILED || !Number.isFinite(action.now)) return state;
      const isFirstConfirmation = ![
        HERO_PHASES.TRAILER_ENTERING,
        HERO_PHASES.TRAILER_EXPANDED,
      ].includes(state.phase);

      return {
        ...state,
        phase: isFirstConfirmation ? HERO_PHASES.TRAILER_ENTERING : state.phase,
        playbackStatus: HERO_PLAYBACK_STATUS.STABLE,
        playbackStartedAt: state.playbackStartedAt ?? action.now,
      };
    }

    case 'VISUAL_READY':
      if (
        isStale(state, action)
        || state.phase === HERO_PHASES.TRAILER_FAILED
        || state.playbackStatus !== HERO_PLAYBACK_STATUS.STABLE
        || ![
          HERO_PHASES.TRAILER_ENTERING,
          HERO_PHASES.TRAILER_EXPANDED,
          HERO_PHASES.TRAILER_COMPACT,
        ].includes(state.phase)
      ) return state;
      return { ...state, visualReady: true, posterVisible: false };

    case 'VISUAL_HIDDEN':
      if (isStale(state, action) || (state.posterVisible && !state.visualReady)) return state;
      return { ...state, visualReady: false, posterVisible: true };

    case 'PLAYBACK_PAUSED': {
      if (isStale(state, action)) return state;
      const spent = spendPlayback(state, action.now);
      return {
        ...spent,
        playbackStatus: HERO_PLAYBACK_STATUS.PAUSED,
        visualReady: false,
        posterVisible: true,
      };
    }

    case 'BUFFERING_SUSTAINED': {
      if (isStale(state, action)) return state;
      const spent = spendPlayback(state, action.now);
      return {
        ...spent,
        playbackStatus: HERO_PLAYBACK_STATUS.PAUSED,
        visualReady: false,
        posterVisible: true,
      };
    }

    case 'VIDEO_ENTERED':
      if (isStale(state, action) || state.phase !== HERO_PHASES.TRAILER_ENTERING) return state;
      return { ...state, phase: HERO_PHASES.TRAILER_EXPANDED };

    case 'COMPACT_ELAPSED': {
      if (
        isStale(state, action)
        || state.playbackStatus !== HERO_PLAYBACK_STATUS.STABLE
        || state.playbackStartedAt == null
        || !isPlaybackPhase(state.phase)
      ) return state;
      const spent = spendPlayback(state, action.now);
      return {
        ...spent,
        phase: HERO_PHASES.TRAILER_COMPACT,
        compactRemainingMs: 0,
        overviewRevealed: false,
        hasCompacted: true,
        playbackStartedAt: action.now,
      };
    }

    case 'PREVIEW_ELAPSED': {
      if (
        isStale(state, action)
        || state.playbackStatus !== HERO_PLAYBACK_STATUS.STABLE
        || state.playbackStartedAt == null
        || !isPlaybackPhase(state.phase)
      ) return state;
      const spent = spendPlayback(state, action.now);
      return {
        ...spent,
        previewRemainingMs: 0,
        playbackStartedAt: action.now,
      };
    }

    case 'REVEAL_OVERVIEW':
      if (isStale(state, action) || state.phase !== HERO_PHASES.TRAILER_COMPACT) return state;
      return { ...state, overviewRevealed: true };

    case 'HIDE_OVERVIEW':
      if (isStale(state, action) || state.phase !== HERO_PHASES.TRAILER_COMPACT) return state;
      return { ...state, overviewRevealed: false };

    case 'AUDIO_PREFERENCE_CHANGED':
      return { ...state, audioStatus: action.audioStatus };

    case 'AUTOPLAY_SOUND_BLOCKED':
      if (isStale(state, action)) return state;
      return { ...state, audioStatus: HERO_AUDIO_STATUS.AUTOPLAY_SOUND_BLOCKED };

    case 'AUDIO_FALLBACK_MUTED':
      if (isStale(state, action)) return state;
      return { ...state, audioStatus: HERO_AUDIO_STATUS.MUTED_ACTIVE };

    case 'SOUND_CONFIRMED':
      if (isStale(state, action)) return state;
      return { ...state, audioStatus: HERO_AUDIO_STATUS.SOUND_ACTIVE };

    case 'TRAILER_FAILED': {
      if (isStale(state, action)) return state;
      const spent = spendPlayback(state, action.now);
      return {
        ...spent,
        phase: HERO_PHASES.TRAILER_FAILED,
        metadataStatus: action.reason === HERO_FAILURE_REASONS.MISSING_VIDEO
          ? HERO_METADATA_STATUS.MISSING
          : state.videoSource
            ? state.metadataStatus
            : HERO_METADATA_STATUS.FAILED,
        playerStatus: HERO_PLAYER_STATUS.DISABLED,
        playbackStatus: HERO_PLAYBACK_STATUS.FAILED,
        visualReady: false,
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
