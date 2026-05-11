import { createContext, useContext, useEffect, useState, useCallback } from "react"
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

export const AppContext = createContext()

export const AppProvider = ({ children }) => {
  const [isAdmin, setIsAdmin] = useState(false)
  const [shows, setShows] = useState([])
  const [favoriteMovies, setFavoriteMovies] = useState([])
  const image_base_url = import.meta.env.VITE_TMDB_IMAGE_BASE_URL
  const { user } = useUser()
  const { getToken } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const fetchShows = useCallback(async () => {
    try {
      const { data } = await api.get('/api/show/all');
      if (data.success) {
        setShows(data.shows);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      // Handled by interceptor
    }
  }, []);

  const fetchIsAdmin = useCallback(async () => {
    try {
      const token = await getToken();
      const { data } = await api.get('/api/admin/is-admin', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIsAdmin(data.isAdmin);

      if (!data.isAdmin && location.pathname.startsWith('/admin')) {
        navigate('/');
        toast.error("You are not authorized to access the admin dashboard");
      }
    } catch (error) {
      // Handled by interceptor
    }
  }, [getToken, location.pathname, navigate]);

  const fetchFavoriteMovies = useCallback(async () => {
    try {
      const token = await getToken();
      const { data } = await api.get('/api/user/favorites', {
        headers: { Authorization: `Bearer ${token}` } 
      });
      if (data.success) {
        setFavoriteMovies(data.movies);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      // Handled by interceptor
    }
  }, [getToken]);

  useEffect(() => {
    fetchShows(); 
  }, [fetchShows]);

  useEffect(() => {
    if (user) {
      fetchIsAdmin();
      fetchFavoriteMovies();
    }
  }, [user, fetchIsAdmin, fetchFavoriteMovies]);

  const value = {
    axios: api, // Provide our configured instance
    user,
    getToken,
    navigate,
    isAdmin,
    shows,
    favoriteMovies,
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

export const useAppContext = () => useContext(AppContext) 
