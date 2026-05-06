import { createContext, useContext, useEffect, useCallback, useState } from 'react';
import axios from 'axios';
import { useAuth, useUser } from '@clerk/react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { dummyShowsData } from '../assets/assets';

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
      if (!token) return;
      const { data } = await axios.get('/api/admin/is-admin', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIsAdmin(data.isAdmin);
      if (!data.isAdmin && location.pathname.startsWith('/admin')) {
        navigate('/');
        toast.error('You are not authorized to access admin dashboard.');
      }
    } catch {
      // BE chưa sẵn sàng, bỏ qua
    }
  }, [getToken, navigate, location.pathname]);

  const fetchShows = useCallback(async () => {
    try {
      // TODO: Bỏ comment khi backend sẵn sàng
      // const { data } = await axios.get('/api/show/all');
      // if (data.success) setShows(data.shows);
      // else toast.error(data.message);

      setShows(dummyShowsData);
    } catch {
      // BE chưa sẵn sàng, bỏ qua
    }
  }, []);

  const fetchFavoriteMovies = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const { data } = await axios.get('/api/user/favorites', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) {
        setFavoriteMovies(data.movies);
      }
    } catch {
      // BE chưa sẵn sàng, bỏ qua
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
    image_base_url,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};