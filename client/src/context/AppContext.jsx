import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react"
import { useUser, useAuth } from "@clerk/react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from 'react-hot-toast'
import { apiClient as api } from '../lib/apiClient.js';

// eslint-disable-next-line react-refresh/only-export-components
export const AppContext = createContext()

export const AppProvider = ({ children }) => {
  // The admin answer is kept with the user it was checked for, so a pending or
  // stale check is never mistaken for "not an admin" by the route guard below.
  const [adminCheck, setAdminCheck] = useState({ userId: null, isAdmin: false })
  
  const { user } = useUser()
  const { getToken } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // Setup Axios Interceptors
  useEffect(() => {
    const requestInterceptor = api.interceptors.request.use(
      async (config) => {
        try {
          const token = await getToken();
          if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
          }
        } catch (err) {
          console.warn("[Auth Interceptor] Failed to fetch token", err);
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    const responseInterceptor = api.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error.response?.status;
        const url = error.config?.url || '';

        // Silently handle auth errors — user just isn't logged in
        if (status === 401 || status === 403) {
          // Only log for non-admin, non-favorites routes (those are expected when logged out)
          if (!url.includes('/is-admin') && !url.includes('/favorites')) {
            console.warn(`[Auth] ${status} on ${url}`);
          }
        } else if (status === 503) {
          console.warn('[API] Database temporarily unavailable');
        } else if (error.code !== 'ERR_CANCELED') {
          // Don't log aborted requests (e.g., from AbortController timeouts)
          const message = error.response?.data?.message || error.message || "Network Error";
          console.error(`[API Error] ${url}:`, message);
        }
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.request.eject(requestInterceptor);
      api.interceptors.response.eject(responseInterceptor);
    };
  }, [getToken]);

  const userId = user?.id ?? null;

  // Only checks admin status; redirects are the route guard's job.
  const fetchIsAdmin = useCallback(async () => {
    if (!userId) return;
    let isAdmin = false;
    try {
      const { data } = await api.get('/api/admin/is-admin');
      isAdmin = data?.isAdmin === true;
    } catch {
      // A 401/403 is the expected answer for non-admins and is logged by the interceptor.
    }
    setAdminCheck({ userId, isAdmin });
  }, [userId]);

  useEffect(() => {
    // The state update happens after the request resolves, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchIsAdmin();
  }, [fetchIsAdmin]);

  const adminChecked = Boolean(userId) && adminCheck.userId === userId;
  const isAdmin = adminChecked && adminCheck.isAdmin;

  // Clerk takes the Google picture only when an account is created with Google.
  // An account linked to Google later keeps the default avatar, so ask the server
  // to copy it over. Once per browser session per user, whatever the outcome.
  const needsGoogleAvatar = Boolean(user && !user.hasImage && user.externalAccounts?.some(
    (account) => ['google', 'oauth_google'].includes(account.provider) && account.imageUrl,
  ));
  useEffect(() => {
    if (!needsGoogleAvatar) return;
    const attemptKey = `nitro_avatar_sync:${user.id}`;
    try {
      if (sessionStorage.getItem(attemptKey)) return;
      sessionStorage.setItem(attemptKey, '1');
    } catch {
      // Storage blocked: the server refuses to overwrite a real picture, so a repeat is harmless.
    }
    api.post('/api/user/sync-avatar')
      .then(({ data }) => (data?.updated ? user.reload() : null))
      .catch(() => {
        // Logged by the API interceptor; the default avatar simply stays.
      });
  }, [needsGoogleAvatar, user]);

  // Waits for the check to finish: redirecting while it is still pending bounced
  // real admins, and keying only on `isAdmin` let a confirmed non-admin stay.
  const onAdminRoute = location.pathname.startsWith('/admin');
  useEffect(() => {
    if (onAdminRoute && adminChecked && !isAdmin) {
      navigate('/');
      toast.error("You are not authorized to access the admin dashboard");
    }
  }, [onAdminRoute, adminChecked, isAdmin, navigate]);

  // Memoised so navigating (which re-renders this provider) does not re-render every consumer.
  const value = useMemo(() => ({
    axios: api,
    user,
    getToken,
    navigate,
    isAdmin,
    adminChecked,
    fetchIsAdmin,
  }), [user, getToken, navigate, isAdmin, adminChecked, fetchIsAdmin])

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAppContext = () => useContext(AppContext)
