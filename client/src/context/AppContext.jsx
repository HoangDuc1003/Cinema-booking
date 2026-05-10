import { createContext, useContext, useEffect, useState, useCallback } from "react"
import axios from "axios";
import { useUser, useAuth } from "@clerk/react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from 'react-hot-toast'

axios.defaults.baseURL = import.meta.env.VITE_BASE_URL
// eslint-disable-next-line react-refresh/only-export-components
export const AppContext = createContext()

export const AppProvider = ({ children }) => {
  const [isAdmin, setIsAdmin] = useState(false)
  const [shows, setShows] = useState([])
  const [favoriteMovies, setFavoriteMovies] = useState([])

  const { user } = useUser()
  const { getToken } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // 1. Hàm lấy danh sách show (Dùng useCallback bọc lại)
  const fetchShows = useCallback(async () => {
    try {
      const { data } = await axios.get('api/show/all');
      if (data.success) {
        setShows(data.shows);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  const fetchIsAdmin = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/admin/is-admin', {
        headers: { Authorization: `Bearer ${await getToken()}` }
      });
      setIsAdmin(data.isAdmin);

      if (!data.isAdmin && location.pathname.startsWith('/admin')) {
        navigate('/');
        toast.error("You are not authorized to access the admin dashboard");
      }
    } catch (error) {
      console.error(error);
    }
  }, [getToken, location.pathname, navigate]);

  const fetchFavoriteMovies = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/user/favorite', {
        headers: { Authorization: `Bearer ${await getToken()}` } 
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
    const loadShows = async () => {
      await fetchShows();
    };

    loadShows(); 
  }, [fetchShows]);
  useEffect(() => {
    const loadUserData = async () => {
      if (user) {
        await fetchIsAdmin();
        await fetchFavoriteMovies();
      }
    };
    loadUserData(); 
  }, [user, fetchIsAdmin, fetchFavoriteMovies]);

  const value = {
    axios,
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

// eslint-disable-next-line react-refresh/only-export-components
export const useAppContext = () => useContext(AppContext) 
