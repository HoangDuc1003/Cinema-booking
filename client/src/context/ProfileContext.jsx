import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useClerk, useUser } from '@clerk/react';
import { useAppContext } from './AppContext';
import * as profileService from '../services/profileService';

const ProfileContext = createContext(null);
const PROFILE_SESSION_PREFIX = 'nitrocine:active-profile:';
const TEST_MODE = import.meta.env.DEV && import.meta.env.VITE_E2E_PROFILE_TEST === 'true';

const getTestState = () => (TEST_MODE ? globalThis.__NITROCINE_PROFILE_TEST__ || null : null);
const getStorageKey = (userId) => `${PROFILE_SESSION_PREFIX}${userId}`;

export const ProfileProvider = ({ children }) => {
  const { user, isLoaded } = useUser();
  const { openSignIn } = useClerk();
  const { axios } = useAppContext();
  const testState = useMemo(() => getTestState(), []);
  const userId = testState?.userId || user?.id || '';
  const signedIn = testState ? testState.signedIn === true : Boolean(user);
  const authLoaded = testState ? true : isLoaded;
  const [profiles, setProfiles] = useState(() => testState?.profiles || []);
  const [activeProfile, setActiveProfile] = useState(null);
  const [pendingLaunch, setPendingLaunch] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(signedIn));
  const [error, setError] = useState('');
  const previousUserIdRef = useRef('');

  useEffect(() => {
    let alive = true;
    const previousUserId = previousUserIdRef.current;
    if (previousUserId && previousUserId !== userId) {
      sessionStorage.removeItem(getStorageKey(previousUserId));
    }
    previousUserIdRef.current = userId;
    queueMicrotask(() => {
      if (!alive) return;
      setActiveProfile(null);
      setPendingLaunch(null);
      setError('');
    });

    if (!signedIn || !userId) {
      queueMicrotask(() => {
        if (!alive) return;
        setProfiles([]);
        setIsLoading(false);
      });
      return () => { alive = false; };
    }

    if (testState) {
      const nextProfiles = Array.isArray(testState.profiles) ? testState.profiles : [];
      const storedId = sessionStorage.getItem(getStorageKey(userId));
      queueMicrotask(() => {
        if (!alive) return;
        setProfiles(nextProfiles);
        setActiveProfile(nextProfiles.find((profile) => profile.id === storedId) || null);
        setIsLoading(false);
      });
      return () => { alive = false; };
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      if (alive) setIsLoading(true);
    });
    profileService.fetchProfiles(axios, { signal: controller.signal })
      .then((nextProfiles) => {
        setProfiles(nextProfiles);
        const storedId = sessionStorage.getItem(getStorageKey(userId));
        setActiveProfile(nextProfiles.find((profile) => profile.id === storedId) || null);
      })
      .catch((requestError) => {
        if (requestError?.code !== 'ERR_CANCELED') setError('Không thể tải hồ sơ. Vui lòng thử lại.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [axios, signedIn, testState, userId]);

  const selectProfile = useCallback((profile) => {
    if (!userId || !profiles.some((item) => item.id === profile?.id)) return;
    sessionStorage.setItem(getStorageKey(userId), profile.id);
    setActiveProfile(profile);
    setPendingLaunch(profile);
  }, [profiles, userId]);

  const finishLaunch = useCallback(() => setPendingLaunch(null), []);

  const switchProfile = useCallback(() => {
    if (userId) sessionStorage.removeItem(getStorageKey(userId));
    setPendingLaunch(null);
    setActiveProfile(null);
  }, [userId]);

  const mutateProfiles = useCallback(async (action, ...args) => {
    setError('');
    if (testState) {
      if (action === 'create') {
        const input = args[0];
        const created = { id: `test-${Date.now()}`, ...input };
        setProfiles((current) => [...current, created]);
        return created;
      }
      if (action === 'update') {
        const [profileId, input] = args;
        setProfiles((current) => current.map((item) => item.id === profileId ? { ...item, ...input } : item));
        return null;
      }
      if (action === 'delete') {
        const [profileId] = args;
        setProfiles((current) => current.filter((item) => item.id !== profileId));
        return null;
      }
    }

    try {
      const data = await profileService[`${action}Profile`](axios, ...args);
      setProfiles(data.profiles || []);
      if (activeProfile) {
        const nextActive = data.profiles?.find((item) => item.id === activeProfile.id) || null;
        setActiveProfile(nextActive);
        if (!nextActive) switchProfile();
      }
      return data.profile || null;
    } catch (requestError) {
      const message = requestError.response?.data?.message || 'Không thể cập nhật hồ sơ.';
      setError(message);
      throw requestError;
    }
  }, [activeProfile, axios, switchProfile, testState]);

  const value = useMemo(() => ({
    activeProfile,
    authLoaded,
    createProfile: (input) => mutateProfiles('create', input),
    deleteProfile: (profileId) => mutateProfiles('delete', profileId),
    error,
    finishLaunch,
    isLoading,
    isSignedIn: signedIn,
    openSignIn,
    pendingLaunch,
    profiles,
    selectProfile,
    switchProfile,
    updateProfile: (profileId, input) => mutateProfiles('update', profileId, input),
    userId,
  }), [activeProfile, authLoaded, error, finishLaunch, isLoading, mutateProfiles, openSignIn, pendingLaunch, profiles, selectProfile, signedIn, switchProfile, userId]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useProfiles = () => {
  const context = useContext(ProfileContext);
  if (!context) throw new Error('useProfiles must be used within ProfileProvider.');
  return context;
};
