import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchMovieDetails, fetchPopularMovies } from '../services/tmdb';
import BlurCircle from '../components/BlurCircle'
import { StarIcon, Heart, PlayCircleIcon } from 'lucide-react'
import timeFormat from '../lib/timeFormat'
import MovieCard from '../components/MovieCard';
import DateSelect from '../components/DateSelect';
import Loading from '../components/Loading';
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';

const MovieDetails = () => {

  const [movies, setMovies] = useState([]);
  const { id } = useParams();
  const [show, setShow] = useState(null);
  const [availableDates, setAvailableDates] = useState({});
  const imageBaseUrl = "https://image.tmdb.org/t/p/original";
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const navigate = useNavigate();
  const { axios, getToken, user } = useAppContext();
  const [isFavorited, setIsFavorited] = useState(false);

  const toggleFavorite = (e) => {
    e.stopPropagation();
    if (!show) return;
    const favorites = JSON.parse(localStorage.getItem('nitro_favorites') || '[]');
    let newFavorites;
    if (isFavorited) {
      newFavorites = favorites.filter(f => f.id !== show.id);
      toast.success('Removed from favorites');
    } else {
      newFavorites = [...favorites, show];
      toast.success('Added to favorites');
    }
    localStorage.setItem('nitro_favorites', JSON.stringify(newFavorites));
    setIsFavorited(!isFavorited);
    window.dispatchEvent(new Event('favoritesUpdated'));
  };

  useEffect(() => {
    if (show) {
      const favorites = JSON.parse(localStorage.getItem('nitro_favorites') || '[]');
      setIsFavorited(favorites.some(f => f.id === show.id));
    }
  }, [show]);
  useEffect(() => {
    let mounted = true;
    const loadAll = async () => {
      setIsLoading(true);
      setHasError(false);
      try {
        const moviesData = await fetchPopularMovies();
        if (!mounted) return;
        setMovies(Array.isArray(moviesData) ? moviesData.slice(0, 4) : []);

        // Fetch from OUR API
        const { data } = await axios.get(`/api/show/${id}`);
        if (!mounted) return;
        if (data.success) {
          setShow(data.movie);
          setAvailableDates(data.dateTime);
        } else {
          // Fallback to TMDB if not in DB
          const movieData = await fetchMovieDetails(id);
          setShow(movieData);
        }
      } catch (error) {
        console.error('Error loading movie details or suggestions:', error);
        setHasError(true);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadAll();
    return () => { mounted = false; };
  }, [id]);


  if (isLoading) return <Loading />;
  if (hasError) return <Loading />;

  return show ? (


    <div className='px-6 md:px-6 lg:px-40 pt-30'>


      <div
        className="absolute left-1/2 -translate-x-1/2 w-[150%] h-45 rounded-[100%] blur-[120px] 
            animate-slow-pulse pointer-events-none"
        style={{ top: '-20px', zIndex: 0, background: 'rgba(0, 123, 255, 0.5)' }}
      ></div>
      <div className='flex flex-col md:flex-row gap-8 max-w-6xl mx-auto'>
        <div className="relative overflow-hidden rounded-xl cursor-pointer group w-auto h-130">
          <img
            src={`${imageBaseUrl}${show.poster_path}`}
            alt={show.title}
            className='max-md:mx-auto rounded-2xl h-130 w-90 object-cover group-hover:scale-105 transition-transform duration-500'
          />
          <div className="absolute top-0 left-[-150%] w-1/2 h-full z-10 block transform -skew-x-12 bg-linear-to-r from-transparent
          via-white/40 to-transparent transition-all duration-700 group-hover:left-[150%]">
          </div>
        </div>

        <div className='relative flex flex-col gap-3'>
          <BlurCircle top='-100px' left='-100px' />
          <p className='text-primary'>ENGLISH</p>

          <h1 className='text-4xl font-semibold max-w-96 text-balance'>{show.title}</h1>

          <div className='flex items-center gap-2 text-gray-300'>
            <StarIcon className='w-5 h-5 text-primary fill-primary' />
            {show.vote_average?.toFixed(1)} User Rating
          </div>

          <p className='text-gray-400 mt-2 text-sm leading-tight max-w-xl'>
            {show.overview}
          </p>

          <p>
            {timeFormat(show.runtime)} • {show.genres?.map(genres => genres.name).join(", ")} • {show.release_date.split("-")[0]}
          </p>
          <div className='flex items-center flex-wrap gap-4 mt-4'>
            <button className="group flex items-center gap-3 px-8 py-4 rounded-full backdrop-blur-sm border transition-all duration-300
              hover:scale-105 bg-white/10 hover:bg-white/20 border-white/20 hover:border-primary/40 cursor-pointer">
              <PlayCircleIcon className={`w-5 h-5`} />
              Watch Trailer
            </button>
            <a href="#dateSelect" className="group flex items-center gap-3 px-8 py-4 bg-linear-to-r from-primary to-primary-dull
                  hover:from-primary-dull hover:to-primary text-white font-semibold rounded-full shadow-lg shadow-primary/30 
                  hover:shadow-xs hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 border
                    border-primary/30 hover:border-primary/60 relative overflow-hidden">
              Buy Tickets</a>
            <button
              onClick={toggleFavorite}
              className="p-4 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer"
            >
              <Heart className={`w-6 h-6 ${isFavorited ? 'text-pink-500 fill-pink-500' : 'text-white'}`} />
            </button>
          </div>
        </div>
      </div>

      <DateSelect id={show.id} availableDates={availableDates} />

      <p className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 mt-20'>You May Also Like</p>
      <div className='relative px-6 md:px-16 lg:px-40 xl:px-44 overflow-hidden mb-10'>

      </div>

      <BlurCircle top='150px' left='0' />
      <BlurCircle bottom='50px' right='50px' />
      <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 w-full ">

        {movies.map((show) => (
          <MovieCard key={show._id} movie={show} />
        ))}
      </div>
      <div className='flex justify-center mt-10'>
        <button onClick={() => { navigate('/movies'); scrollTo(0, 0) }}
          className="group flex items-center gap-3 px-12 py-6 bg-linear-to-r from-primary to-primary-dull
                  hover:from-primary-dull hover:to-primary text-white font-semibold rounded-full shadow-lg shadow-primary/30 
                  hover:shadow-xs hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 border
                    border-primary/30 hover:border-primary/60 relative overflow-hidden mb-10">Show more</button>
      </div>
    </div>

  ) : (
    <Loading />
  )
}
export default MovieDetails