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

// Global interceptor for debugging
api.interceptors.response.use(
    response => response,
    error => {
        const message = error.response?.data?.message || error.message || "Network Error";
        console.error(`[API Error] ${error.config?.url}:`, message);
        return Promise.reject(error);
    }
);

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
      const token = await getToken();
      const { data } = await api.get('/api/admin/is-admin', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setIsAdmin(data?.isAdmin || false);
    } catch (error) {
      setIsAdmin(false);
    }
  }, [getToken, user]);

  const fetchFavoriteMovies = useCallback(async () => {
    if (!user) return; 

    try {
      const token = await getToken();
      const { data } = await api.get('/api/user/favorites', {
        headers: { Authorization: `Bearer ${token}` } 
      });
      if (data && data.success) {
        setFavoriteMovies(data.movies || []);
      }
    } catch (error) {
      console.log(error)
    }
  }, [getToken, user]);

  useEffect(() => {
    fetchShows(); 
  }, [fetchShows]);

  useEffect(() => {
    if (user) {
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