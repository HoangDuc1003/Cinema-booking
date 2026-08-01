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
import MovieCard from '../components/MovieCard';
import DateSelect from '../components/DateSelect';
import Loading from '../components/Loading';
import TrailerSection from '../components/TrailerSection';
import toast from 'react-hot-toast';

const MovieDetails = () => {
  const [movies, setMovies] = useState([]);
  const { id } = useParams();
  const [show, setShow] = useState(null);
  const [availableDates, setAvailableDates] = useState({});
  const [isSimulatedShowtime, setIsSimulatedShowtime] = useState(false);
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
      setIsSimulatedShowtime(false);

      const [movieResult, showtimeResult] = await Promise.allSettled([
        fetchMovieDetails(id, { signal: controller.signal, fallbackMode: 'none' }),
        fetchMovieShowtimes(id, { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;

      if (showtimeResult.status === 'fulfilled') {
        const realDates = showtimeResult.value.dateTime || {};
        setAvailableDates(realDates);
        setIsSimulatedShowtime(showtimeResult.value.simulated === true);
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
        const data = await fetchSimilarMovies(id, { signal: controller.signal, limit: 10 });
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

  useEffect(() => {
    if (recommendationStatus !== 'ready' || movies.length === 0) return;
    
    const carousel = document.getElementById('similar-movies-carousel');
    if (!carousel) return;
    
    const intervalTime = 3000; // 3 seconds
    
    const scrollInterval = setInterval(() => {
      if (carousel.matches(':hover')) return;
      
      const firstChild = carousel.children[0];
      if (!firstChild) return;
      
      const itemWidth = firstChild.getBoundingClientRect().width + 16; // item width + 16px gap
      const jumpDistance = itemWidth * 4;
      const maxScroll = carousel.scrollWidth - carousel.clientWidth;
      
      if (carousel.scrollLeft >= maxScroll - 20) {
        carousel.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        carousel.scrollBy({ left: jumpDistance, behavior: 'smooth' });
      }
    }, intervalTime);
    
    return () => clearInterval(scrollInterval);
  }, [recommendationStatus, movies.length]);

  if (isLoading) return <Loading />;
  if (hasError) return <Loading message="Error loading movie details..." />;

  return show ? (
    <main className='relative isolate min-h-screen bg-[#03060a] pb-20'>
      <div
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        aria-hidden="true"
        >
          {imageUrl && (
            <img
              key={imageUrl}
              src={imageUrl}
              alt=""
              draggable="false"
              decoding="async"
              className="absolute inset-0 w-full h-full scale-110 object-cover object-center blur-[12px] opacity-50 transition-opacity duration-500 ease-out"
            />
          )}

          <div
            className="
              absolute left-[-28%] top-[4%]
              aspect-square w-[320px]
              rounded-full opacity-[0.35] blur-[80px]
              md:left-[-8%] md:top-[8%]
              md:w-[min(34vw,520px)]
              md:opacity-[0.35] md:blur-[90px]
            "
            style={{
              background:
                "radial-gradient(circle, rgba(239,52,87,0.78) 0%, rgba(151,20,48,0.34) 42%, transparent 72%)",
            }}
          />

          <div
            className="
              absolute bottom-[-12%] right-[-35%]
              aspect-square w-[360px]
              rounded-full opacity-[0.35] blur-[80px]
              md:bottom-[-8%] md:right-[-12%]
              md:w-[min(38vw,600px)]
              md:opacity-[0.35] md:blur-[90px]
            "
            style={{
              background:
                "radial-gradient(circle, rgba(177,23,55,0.70) 0%, rgba(105,12,33,0.30) 44%, transparent 74%)",
            }}
          />

          {/* Lightened overlays so background is actually visible */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#03060a]/80 via-[#03060a]/40 to-[#03060a]/80" />

          <div className="absolute inset-0 bg-gradient-to-b from-[#03060a]/20 via-transparent to-[#03060a]" />
        </div>

      <div className="relative z-10 px-6 md:px-6 lg:px-40 pt-[140px] pb-12">
          <div className='flex flex-col md:flex-row gap-8 max-w-6xl mx-auto'>
            <div className="relative overflow-hidden rounded-xl cursor-pointer group w-auto h-130 flex-shrink-0">
              <img
                src={imageUrl}
                alt={show.title}
                className='max-md:mx-auto rounded-2xl h-130 w-[340px] md:w-[320px] object-cover group-hover:scale-105 transition-transform duration-500'
              />
              <div className="absolute top-0 left-[-150%] w-1/2 h-full z-10 block transform -skew-x-12 bg-linear-to-r from-transparent
                via-white/40 to-transparent transition-all duration-700 group-hover:left-[150%]">
              </div>
            </div>

            <div className='relative flex flex-col gap-3'>
              <p className='text-primary font-bold tracking-wider text-sm'>ENGLISH</p>
              <h1 className='text-4xl md:text-5xl font-extrabold max-w-xl text-balance'>{show.title}</h1>

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
        </div>

      <div className="relative z-10 px-6 md:px-6 lg:px-40 mt-10">
        <DateSelect
          id={show._id || show.id}
          availableDates={availableDates}
          isSimulated={isSimulatedShowtime}
          status={showtimeStatus}
          error={showtimeError}
          onRetry={() => setShowtimeReloadToken((value) => value + 1)}
        />

        {showTrailerSection && (
          <TrailerSection sectionId="movie-trailers" featuredMovie={show} movieOnly />
        )}
      </div>

      <section className="relative z-10 w-full mt-16 pb-10">
        <div className="mx-auto w-full max-w-[1440px] px-6 lg:px-10 xl:px-12">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-8">
            You May Also Like
          </h2>

          <div aria-live="polite">
            {recommendationStatus === 'loading' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6">
                {Array.from({ length: 5 }, (_, index) => (
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
                columns="grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                animated
                staggerDelay={80}
              />
            )}
          </div>

          <div className="flex justify-center mt-12">
            <button
              onClick={() => {
                navigate('/movies');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="group flex items-center gap-3 px-12 py-6 bg-linear-to-r from-primary to-primary-dull
                hover:from-primary-dull hover:to-primary text-white font-semibold rounded-full shadow-lg shadow-primary/30
                hover:shadow-xl hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 border
                border-primary/30 hover:border-primary/60 relative overflow-hidden"
            >
              Show more
            </button>
          </div>
        </div>
      </section>
    </main>
  ) : (
    <Loading />
  );
};

export default MovieDetails;
