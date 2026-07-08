import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import axios from "axios";
import { useUser, useAuth } from "@clerk/react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from 'react-hot-toast'

// Use base URL from env if available, otherwise fallback to empty string 
const baseURL = import.meta.env.VITE_BASE_URL || "";
const api = axios.create({
    baseURL: baseURL
});

// eslint-disable-next-line react-refresh/only-export-components
export const AppContext = createContext()

export const AppProvider = ({ children }) => {
  const [isAdmin, setIsAdmin] = useState(false)
  const [shows, setShows] = useState([])
  const [favoriteMovies, setFavoriteMovies] = useState([])
  const adminCheckRef = useRef(false);
  
  // Default TMDB image base URL
  const image_base_url = import.meta.env.VITE_TMDB_IMAGE_BASE_URL || "https://image.tmdb.org/t/p/original";
  
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

  const fetchShows = useCallback(async () => {
    try {
      const { data } = await api.get('/api/show/all');
      if (data && data.success) {
        setShows(data.shows || []);
      }
    } catch (error) {
      // Handled by interceptor
    }
  }, []);

  // FIX: Removed location.pathname and navigate from dependencies.
  // This function now ONLY checks admin status — it doesn't handle redirects.
  const fetchIsAdmin = useCallback(async () => {
    if (!user) return; 
    
    try {
      const { data } = await api.get('/api/admin/is-admin');
      
      setIsAdmin(data?.isAdmin || false);
    } catch (error) {
      setIsAdmin(false);
    }
  }, [user]);

  const fetchFavoriteMovies = useCallback(async () => {
    if (!user) return; 

    try {
      const { data } = await api.get('/api/user/favorites');
      if (data && data.success) {
        setFavoriteMovies(data.movies || []);
      }
    } catch (error) {
      console.log(error)
    }
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchShows(); 
  }, [fetchShows]);

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchIsAdmin();
      fetchFavoriteMovies();
    } else {
      setIsAdmin(false);
      setFavoriteMovies([]);
    }
  }, [user, fetchIsAdmin, fetchFavoriteMovies]);

  // FIX: Separate effect for admin route protection.
  useEffect(() => {
    if (user && !isAdmin && location.pathname.startsWith('/admin')) {
      navigate('/');
      toast.error("You are not authorized to access the admin dashboard");
    }
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    axios: api, 
    user,
    getToken,
    navigate,
    isAdmin,
    shows,
    favoriteMovies,
    image_base_url, 
    fetchShows, 
    fetchIsAdmin,
    fetchFavoriteMovies
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAppContext = () => useContext(AppContext)
