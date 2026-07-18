import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HERO_COMPACT_PLAYBACK_MS,
  HERO_PHASES,
  HERO_PLAYBACK_STATUS,
} from './heroMachine';
const COMPACTING_TRANSITION_MS = 720;
const EXPANDING_TRANSITION_MS = 650;
const POINTER_ENTER_DELAY_MS = 100;
export const HERO_POINTER_HOLD_MS = 3_000;
const MOBILE_AUTO_COLLAPSE_MS = 6_000;

export const useHeroContentDisclosure = ({
  movieKey,
  phase,
  playbackStatus,
  visualReady,
  posterVisible,
  reducedMotion,
}) => {
  const [disclosureState, setDisclosureState] = useState('expanded');
  const [isPointerActive, setIsPointerActive] = useState(false);
  const [isFocusActive, setIsFocusActive] = useState(false);
  const [ctaActive, setCtaActive] = useState(false);

  const timersRef = useRef(new Set());
  const pointerLeaveTimerRef = useRef(null);
  const pointerIntentRef = useRef(false);
  const stateRef = useRef(disclosureState);
  useEffect(() => {
    stateRef.current = disclosureState;
  }, [disclosureState]);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current.clear();
    pointerLeaveTimerRef.current = null;
  }, []);

  const clearPointerLeaveTimer = useCallback(() => {
    const timerId = pointerLeaveTimerRef.current;
    if (timerId == null) return;
    window.clearTimeout(timerId);
    timersRef.current.delete(timerId);
    pointerLeaveTimerRef.current = null;
  }, []);

  const scheduleTimer = useCallback((fn, delayMs) => {
    const timerId = window.setTimeout(() => {
      timersRef.current.delete(timerId);
      fn();
    }, delayMs);
    timersRef.current.add(timerId);
    return timerId;
  }, []);

  // Reset to expanded immediately whenever movie changes or when reverting to poster
  useEffect(() => {
    clearAllTimers();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisclosureState('expanded');
    setIsPointerActive(false);
    setIsFocusActive(false);
    setCtaActive(false);
  }, [clearAllTimers, movieKey]);

  const expand = useCallback(({ animate = true } = {}) => {
    clearAllTimers();
    if (!animate || reducedMotion) {
      setDisclosureState('expanded');
      return;
    }
    if (stateRef.current === 'expanded' || stateRef.current === 'expanding') return;
    setDisclosureState('expanding');
    scheduleTimer(() => {
      setDisclosureState('expanded');
    }, EXPANDING_TRANSITION_MS);
  }, [clearAllTimers, reducedMotion, scheduleTimer]);

  const compact = useCallback(({ animate = true } = {}) => {
    clearAllTimers();
    if (!animate || reducedMotion) {
      setDisclosureState('compact');
      return;
    }
    if (stateRef.current === 'compact' || stateRef.current === 'compacting') return;
    setDisclosureState('compacting');
    scheduleTimer(() => {
      setDisclosureState('compact');
    }, COMPACTING_TRANSITION_MS);
  }, [clearAllTimers, reducedMotion, scheduleTimer]);

  // Main five-second stable playback compact rule
  useEffect(() => {
    if (
      reducedMotion
      || phase === HERO_PHASES.POSTER
      || phase === HERO_PHASES.TRAILER_LOADING
      || phase === HERO_PHASES.TRAILER_FAILED
      || playbackStatus !== HERO_PLAYBACK_STATUS.STABLE
      || !visualReady
      || posterVisible
      || isPointerActive
      || isFocusActive
      || ctaActive
    ) {
      if (stateRef.current === 'compact' || stateRef.current === 'compacting') {
        // If playback pauses/buffers while compact, expand to show full details
        if (playbackStatus === HERO_PLAYBACK_STATUS.PAUSED || !visualReady || posterVisible) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          expand({ animate: false });
        }
      }
      return undefined;
    }

    if (stateRef.current !== 'expanded') return undefined;

    const timers = timersRef.current;
    const timerId = scheduleTimer(() => {
      compact({ animate: true });
    }, HERO_COMPACT_PLAYBACK_MS);

    return () => {
      window.clearTimeout(timerId);
      timers.delete(timerId);
    };
  }, [
    compact,
    ctaActive,
    expand,
    isFocusActive,
    isPointerActive,
    phase,
    playbackStatus,
    posterVisible,
    reducedMotion,
    scheduleTimer,
    visualReady,
  ]);

  // Handle pointer hover intent (80-120ms enter, 900-1300ms leave)
  const handlePointerEnter = useCallback(() => {
    clearPointerLeaveTimer();
    pointerIntentRef.current = false;
  }, [clearPointerLeaveTimer]);

  const handlePointerMove = useCallback(() => {
    if (pointerIntentRef.current) return;
    pointerIntentRef.current = true;
    setIsPointerActive(true);
    if (stateRef.current === 'compact' || stateRef.current === 'compacting') {
      scheduleTimer(() => {
        expand({ animate: true });
      }, POINTER_ENTER_DELAY_MS);
    }
  }, [expand, scheduleTimer]);

  const handlePointerLeave = useCallback(() => {
    pointerIntentRef.current = false;
    setIsPointerActive(false);
    clearPointerLeaveTimer();
    if (
      !reducedMotion
      && phase !== HERO_PHASES.POSTER
      && playbackStatus === HERO_PLAYBACK_STATUS.STABLE
      && visualReady
      && !posterVisible
      && !isFocusActive
      && !ctaActive
    ) {
      pointerLeaveTimerRef.current = scheduleTimer(() => {
        pointerLeaveTimerRef.current = null;
        compact({ animate: true });
      }, HERO_POINTER_HOLD_MS);
    }
  }, [clearPointerLeaveTimer, compact, ctaActive, isFocusActive, phase, playbackStatus, posterVisible, reducedMotion, scheduleTimer, visualReady]);

  const handleFocusCapture = useCallback(() => {
    clearPointerLeaveTimer();
    setIsFocusActive(true);
    if (stateRef.current !== 'expanded') expand({ animate: true });
  }, [clearPointerLeaveTimer, expand]);

  const handleBlurCapture = useCallback((event) => {
    const nextTarget = event.relatedTarget;
    if (event.currentTarget && nextTarget && event.currentTarget.contains(nextTarget)) return;
    setIsFocusActive(false);
    clearPointerLeaveTimer();
    if (
      !reducedMotion
      && phase !== HERO_PHASES.POSTER
      && playbackStatus === HERO_PLAYBACK_STATUS.STABLE
      && visualReady
      && !posterVisible
      && !isPointerActive
      && !ctaActive
    ) {
      pointerLeaveTimerRef.current = scheduleTimer(() => {
        pointerLeaveTimerRef.current = null;
        compact({ animate: true });
      }, HERO_POINTER_HOLD_MS);
    }
  }, [clearPointerLeaveTimer, compact, ctaActive, isPointerActive, phase, playbackStatus, posterVisible, reducedMotion, scheduleTimer, visualReady]);

  // Touch / mobile tap title to toggle or expand
  const handleCompactTitleClick = useCallback(() => {
    if (stateRef.current === 'compact' || stateRef.current === 'compacting') {
      expand({ animate: true });
      // Schedule auto-collapse on mobile after 6 seconds
      scheduleTimer(() => {
        if (
          !reducedMotion
          && playbackStatus === HERO_PLAYBACK_STATUS.STABLE
          && visualReady
          && !posterVisible
          && !isPointerActive
          && !isFocusActive
        ) {
          compact({ animate: true });
        }
      }, MOBILE_AUTO_COLLAPSE_MS);
    }
  }, [compact, expand, isFocusActive, isPointerActive, playbackStatus, posterVisible, reducedMotion, scheduleTimer, visualReady]);

  const notifyCtaInteraction = useCallback(() => {
    setCtaActive(true);
    scheduleTimer(() => setCtaActive(false), 3_000);
  }, [scheduleTimer]);

  useEffect(() => () => clearAllTimers(), [clearAllTimers]);

  return {
    disclosureState,
    isExpanded: disclosureState === 'expanded',
    isCompacting: disclosureState === 'compacting',
    isCompact: disclosureState === 'compact' || disclosureState === 'compacting',
    isExpanding: disclosureState === 'expanding',
    isPointerActive,
    isFocusActive,
    expand,
    compact,
    handlePointerEnter,
    handlePointerMove,
    handlePointerLeave,
    handleFocusCapture,
    handleBlurCapture,
    handleCompactTitleClick,
    notifyCtaInteraction,
  };
};
