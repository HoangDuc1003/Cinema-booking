import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchMovieDetails, fetchPopularMovies } from '../services/tmdb';
import BlurCircle from '../components/BlurCircle'
import { StarIcon, Heart, PlayCircleIcon } from 'lucide-react'
import timeFormat from '../lib/timeFormat'
import MovieGrid from '../components/MovieGrid';
import DateSelect from '../components/DateSelect';
import Loading from '../components/Loading';
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';
import generateMockShowtimes from '../lib/generateMockShowtimes';

const MovieDetails = () => {
  const [movies, setMovies] = useState([]);
  const { id } = useParams();
  const [show, setShow] = useState(null);
  const [availableDates, setAvailableDates] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const navigate = useNavigate();
  const { axios } = useAppContext();
  const [isFavorited, setIsFavorited] = useState(false);
  const [isMockData, setIsMockData] = useState(false);

  const toggleFavorite = useCallback((e) => {
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
  }, [show, isFavorited]);

  useEffect(() => {
    if (show) {
      const favorites = JSON.parse(localStorage.getItem('nitro_favorites') || '[]');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsFavorited(favorites.some(f => f.id === show.id));
    }
  }, [show]);
  useEffect(() => {
    let mounted = true;

    const loadMovieDetails = async () => {
      setIsLoading(true);
      setHasError(false);
      setIsMockData(false);

      try {
        // TMDB details — cached in sessionStorage for 24h.
        // First call: ~300-500ms. Subsequent: ~5ms (cache hit).
        const movieData = await fetchMovieDetails(id);
        if (!mounted) return;

        if (movieData) {
          setShow(movieData);
          // Generate mock showtimes synchronously (~1ms) — instant dates
          const mockDates = generateMockShowtimes(movieData.id || id);
          setAvailableDates(mockDates);
          setIsMockData(true);
        } else {
          setHasError(true);
        }
      } catch (error) {
        console.error('Error loading movie details:', error);
        if (mounted) setHasError(true);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadMovieDetails();
    return () => { mounted = false; };
  }, [id]);

  useEffect(() => {
    // Only run after Phase 1 completes (show is set)
    if (!show) return;
    let mounted = true;
    fetchPopularMovies()
      .then(data => {
        if (mounted) setMovies(Array.isArray(data) ? data.slice(0, 4) : []);
      })
      .catch(() => {});

    // Check backend for real showtimes (10s timeout — Vercel cold starts can take 5-8s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    axios.get(`/api/show/${id}`, { signal: controller.signal })
      .then(({ data }) => {
        if (!mounted) return;
        if (data?.success && data.movie) {
          // Backend has this movie — upgrade to real data
          setShow(data.movie);
          const realDates = data.dateTime;
          if (realDates && Object.keys(realDates).length > 0) {
            setAvailableDates(realDates);
            setIsMockData(false);
          }
        }
      })
      .catch(() => {}) // Backend unavailable — keep TMDB data + mock dates
      .finally(() => clearTimeout(timeoutId));

    return () => {
      mounted = false;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [show?._id || show?.id, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Memoize derived values to avoid recalculating on every render
  const imageUrl = useMemo(() => {
    if (!show?.poster_path) return '';
    const path = show.poster_path;
    if (path.startsWith('http')) return path;
    return `https://image.tmdb.org/t/p/original${path}`;
  }, [show?.poster_path]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const releaseYear = useMemo(() =>
    show?.release_date ? show.release_date.split("-")[0] : 'N/A',
    [show?.release_date]
  );

  const genreNames = useMemo(() =>
    show?.genres?.map(g => g.name).join(", ") || '',
    [show?.genres]
  );

  if (isLoading) return <Loading />;
  if (hasError) return <Loading message="Error loading movie details..." />;

  return show ? (
    <div className='px-6 md:px-6 lg:px-40 pt-30'>
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[90%] h-45 rounded-[100%] blur-[120px] 
          animate-slow-pulse pointer-events-none"
        style={{ top: '-20px', zIndex: 0, background: 'rgba(0, 123, 255, 0.5)' }}
      />

      <div className='flex flex-col md:flex-row gap-8 max-w-6xl mx-auto'>
        <div className="relative overflow-hidden rounded-xl cursor-pointer group w-auto h-130">
          <img
            src={imageUrl}
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
            {timeFormat(show.runtime)} • {genreNames} • {releaseYear}
          </p>

          <div className='flex items-center flex-wrap gap-4 mt-4'>
            <button className="group flex items-center gap-3 px-8 py-4 rounded-full backdrop-blur-sm border transition-all duration-300
              hover:scale-105 bg-white/10 hover:bg-white/20 border-white/20 hover:border-primary/40 cursor-pointer">
              <PlayCircleIcon className="w-5 h-5" />
              Watch Trailer
            </button>
            <a href="#dateSelect" className="group flex items-center gap-3 px-12 py-6 bg-linear-to-r from-primary to-primary-dull
            hover:from-primary-dull hover:to-primary text-white font-semibold rounded-full shadow-lg shadow-primary/30
            hover:shadow-xl hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 border
            border-primary/30 hover:border-primary/60 relative overflow-hidden">
              Buy Tickets
            </a>
            <button
              onClick={toggleFavorite}
              className="p-4 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer"
            >
              <Heart className={`w-6 h-6 ${isFavorited ? 'text-pink-500 fill-pink-500' : 'text-white'}`} />
            </button>
          </div>
        </div>
      </div>

      <DateSelect id={show._id || show.id} availableDates={availableDates} isMockData={isMockData} />

      <p className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 mt-20'>You May Also Like</p>
      <div className='relative overflow-hidden mb-10' />

      <BlurCircle top='150px' left='0' />
      <BlurCircle bottom='50px' right='50px' />

      <MovieGrid
        movies={movies}
        columns="sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        animated={true}
        staggerDelay={100}
      />

      <div className='flex justify-center mt-10'>
        <button
          onClick={() => { navigate('/movies'), window.scrollTo({top: 0,behavior:'smooth'}) }}
          className="group flex items-center gap-3 px-12 py-6 bg-linear-to-r from-primary to-primary-dull
            hover:from-primary-dull hover:to-primary text-white font-semibold rounded-full shadow-lg shadow-primary/30
            hover:shadow-xl hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 border
            border-primary/30 hover:border-primary/60 relative overflow-hidden mb-5"
        >
          Show more
        </button>
      </div>
    </div>
  ) : (
    <Loading />
  );
};

export default MovieDetails;
