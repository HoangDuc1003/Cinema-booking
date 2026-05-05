import { createContext, useContext, useEffect, useCallback, useState } from 'react';
import axios from 'axios';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const apiBaseUrl = (import.meta.env.VITE_BASE_URL || '').trim().replace(/\/+$/, '');
axios.defaults.baseURL = apiBaseUrl;

// eslint-disable-next-line react-refresh/only-export-components
export const AppContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAppContext = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [shows, setShows] = useState([]);
  const [favoriteMovies, setFavoriteMovies] = useState([]);
  
  const { user } = useUser();
  const { getToken } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const image_base_url = import.meta.env.VITE_TMDB_IMAGE_BASE_URL;

  const fetchIsAdmin = useCallback(async () => {
    try {
      const token = await getToken();
      const { data } = await axios.get('/api/admin/is-admin', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIsAdmin(data.isAdmin);
      
      if (!data.isAdmin && location.pathname.startsWith('/admin')) {
        navigate('/');
        toast.error('You are not authorized to access admin dashboard.');
      }
    } catch (error) {
      console.error(error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken, navigate]); 

  const fetchShows = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/show/all');
      if (data.success) {
        setShows(data.shows);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  const fetchFavoriteMovies = useCallback(async () => {
    try {
      const token = await getToken();
      const { data } = await axios.get('/api/user/favorites', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) {
        setFavoriteMovies(data.movies);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error(error);
    }
  }, [getToken]);
  
  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchIsAdmin();
      fetchFavoriteMovies();
    }
  }, [user, fetchIsAdmin, fetchFavoriteMovies]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchShows();
  }, [fetchShows]);

  const value = {
    axios,
    fetchIsAdmin,
    user, 
    getToken, 
    navigate, 
    isAdmin, 
    shows,
    favoriteMovies, 
    fetchFavoriteMovies, 
    image_base_url
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};