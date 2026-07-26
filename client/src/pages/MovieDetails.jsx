import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  fetchMovieDetails,
  fetchMovieShowtimes,
  fetchSimilarMovies,
} from '../services/tmdb';
import BlurCircle from '../components/BlurCircle'
import { StarIcon, Heart, PlayCircleIcon, RefreshCw } from 'lucide-react'
import timeFormat from '../lib/timeFormat'
import MovieGrid from '../components/MovieGrid';
import DateSelect from '../components/DateSelect';
import Loading from '../components/Loading';
import TrailerSection from '../components/TrailerSection';
import toast from 'react-hot-toast';

const MovieDetails = () => {
  const [movies, setMovies] = useState([]);
  const { id } = useParams();
  const [show, setShow] = useState(null);
  const [availableDates, setAvailableDates] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showtimeStatus, setShowtimeStatus] = useState('loading');
  const [showtimeError, setShowtimeError] = useState('');
  const [recommendationStatus, setRecommendationStatus] = useState('loading');
  const [recommendationError, setRecommendationError] = useState('');
  const [showtimeReloadToken, setShowtimeReloadToken] = useState(0);
  const [recommendationReloadToken, setRecommendationReloadToken] = useState(0);
  const navigate = useNavigate();
  const [isFavorited, setIsFavorited] = useState(false);
  const [showTrailerSection, setShowTrailerSection] = useState(false);

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
    const controller = new AbortController();

    const loadMovieDetails = async () => {
      setShowTrailerSection(false);
      setIsLoading(true);
      setHasError(false);
      setShowtimeStatus('loading');
      setShowtimeError('');
      setAvailableDates({});

      const [movieResult, showtimeResult] = await Promise.allSettled([
        fetchMovieDetails(id, { signal: controller.signal, fallbackMode: 'none' }),
        fetchMovieShowtimes(id, { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;

      if (showtimeResult.status === 'fulfilled') {
        const realDates = showtimeResult.value.dateTime || {};
        setAvailableDates(realDates);
        setShowtimeStatus(Object.keys(realDates).length ? 'ready' : 'empty');
      } else {
        setShowtimeStatus('error');
        setShowtimeError(showtimeResult.reason?.message || 'Unable to load showtimes.');
      }

      if (movieResult.status === 'fulfilled' && movieResult.value) {
        setShow(movieResult.value);
      } else if (showtimeResult.status === 'fulfilled' && showtimeResult.value.movie) {
        setShow(showtimeResult.value.movie);
      } else {
        setShow(null);
        setHasError(true);
      }

      setIsLoading(false);
    };

    loadMovieDetails().catch((error) => {
      if (controller.signal.aborted) return;
      console.error('Error loading movie details:', error);
      setHasError(true);
      setIsLoading(false);
      setShowtimeStatus('error');
      setShowtimeError(error.message || 'Unable to load showtimes.');
    });

    return () => controller.abort();
  }, [id, showtimeReloadToken]);

  useEffect(() => {
    const controller = new AbortController();

    const loadRecommendations = async () => {
      setMovies([]);
      setRecommendationStatus('loading');
      setRecommendationError('');

      try {
        const data = await fetchSimilarMovies(id, { signal: controller.signal, limit: 4 });
        if (controller.signal.aborted) return;
        const relatedMovies = Array.isArray(data) ? data : [];
        setMovies(relatedMovies);
        setRecommendationStatus(relatedMovies.length ? 'ready' : 'empty');
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') return;
        setRecommendationStatus('error');
        setRecommendationError(error.message || 'Unable to load similar movies.');
      }
    };

    void loadRecommendations();

    return () => controller.abort();
  }, [id, recommendationReloadToken]);

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

  const handleWatchTrailer = () => {
    setShowTrailerSection(true);
    window.setTimeout(() => {
      document.getElementById('movie-trailers')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

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
            <button
              type="button"
              onClick={handleWatchTrailer}
              className="group flex items-center gap-3 px-8 py-4 rounded-full backdrop-blur-sm border transition-all duration-300
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
              type="button"
              onClick={toggleFavorite}
              aria-label={isFavorited ? `Remove ${show.title} from favorites` : `Add ${show.title} to favorites`}
              aria-pressed={isFavorited}
              className="p-4 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer"
            >
              <Heart className={`w-6 h-6 ${isFavorited ? 'text-pink-500 fill-pink-500' : 'text-white'}`} />
            </button>
          </div>
        </div>
      </div>

      <DateSelect
        id={show._id || show.id}
        availableDates={availableDates}
        status={showtimeStatus}
        error={showtimeError}
        onRetry={() => setShowtimeReloadToken((value) => value + 1)}
      />

      {showTrailerSection && (
        <TrailerSection sectionId="movie-trailers" featuredMovie={show} movieOnly />
      )}

      <div className="max-w-6xl mx-auto w-full">
        <p className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 mt-20'>You May Also Like</p>
        <div className='relative overflow-hidden mb-10' />
      </div>

      <BlurCircle top='150px' left='0' />
      <BlurCircle bottom='50px' right='50px' />

      <div className="max-w-6xl mx-auto w-full" aria-live="polite">
        {recommendationStatus === 'loading' && (
          <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="catalog-card-skeleton" aria-hidden="true">
                <span className="catalog-card-skeleton__art" />
              </div>
            ))}
            <span className="sr-only">Loading similar movies</span>
          </div>
        )}

        {recommendationStatus === 'error' && (
          <div className="catalog-state-panel" role="alert">
            <h2>Similar movies are unavailable</h2>
            <p>{recommendationError}</p>
            <button
              type="button"
              className="catalog-state-panel__button"
              onClick={() => setRecommendationReloadToken((value) => value + 1)}
            >
              <RefreshCw aria-hidden="true" />
              Try again
            </button>
          </div>
        )}

        {recommendationStatus === 'empty' && (
          <div className="catalog-state-panel" role="status">
            <h2>No similar movies yet</h2>
            <p>We could not find another matching title with usable artwork.</p>
          </div>
        )}

        {recommendationStatus === 'ready' && (
          <MovieGrid
            movies={movies}
            columns="sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            animated
            staggerDelay={100}
          />
        )}
      </div>

      <div className='flex justify-center mt-10'>
        <button
          onClick={() => {
            navigate('/movies');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
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
