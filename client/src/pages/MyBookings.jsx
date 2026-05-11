import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Loading from '../components/Loading'
import BlurCircle from '../components/BlurCircle'
import AnimatedCard from '../components/AnimatedCard'
import timeFormat from '../lib/timeFormat'
import { dateFormat } from '../lib/dateFormat'
import { useAppContext } from '../context/AppContext'
import { Ticket, Clock, MapPin, CreditCard, Trash2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import MovieGrid from '../components/MovieGrid'
import { fetchPopularMovies } from '../services/tmdb'

const MyBookings = () => {
  const currency = import.meta.env.VITE_CURRENCY || '$'
  const [backendBookings, setBackendBookings] = useState([])
  const [demoBookings, setDemoBookings] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const { getToken, user, axios } = useAppContext();

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `https://image.tmdb.org/t/p/w500${path}`;
  };

  // Load demo bookings from localStorage INSTANTLY
  useEffect(() => {
    try {
      const demos = JSON.parse(localStorage.getItem('nitro_demo_bookings') || '[]');
      setDemoBookings(demos);
    } catch {
      setDemoBookings([]);
    }
  }, []);

  // Load backend bookings and suggestions in background (non-blocking)
  useEffect(() => {
    let mounted = true;

    // Load suggestions
    fetchPopularMovies().then(data => {
      if (mounted) setSuggestions(Array.isArray(data) ? data.slice(0, 4) : []);
    }).catch(() => {});

    // Load backend bookings
    const loadBackendBookings = async () => {
      if (!user) { setIsLoading(false); return; }
      try {
        const { data } = await axios.get('/api/booking/my-bookings', {
          headers: { Authorization: `Bearer ${await getToken()}` },
          timeout: 5000,
        });
        if (mounted && data.success) setBackendBookings(data.bookings || []);
      } catch {
        // Backend unavailable — demo bookings still show
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    loadBackendBookings();

    return () => { mounted = false; };
  }, [user]);

  // Merge both sources, newest first
  const allBookings = useMemo(() => {
    const combined = [
      ...demoBookings.map(b => ({ ...b, isDemo: true })),
      ...backendBookings.map(b => ({ ...b, isDemo: false })),
    ];
    combined.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return combined;
  }, [demoBookings, backendBookings]);

  const deleteDemoBooking = useCallback((bookingId) => {
    setDemoBookings(prev => {
      const updated = prev.filter(b => b._id !== bookingId);
      localStorage.setItem('nitro_demo_bookings', JSON.stringify(updated));
      return updated;
    });
    toast.success('Booking removed', {
      icon: '🗑️',
      style: { background: '#1a1a1a', color: '#fff', border: '1px solid #333' }
    });
  }, []);

  const handlePayNow = useCallback(() => {
    toast('Stripe payment coming soon!', {
      icon: '💳',
      style: { background: '#1a1a1a', color: '#fff', border: '1px solid #F84565' }
    });
  }, []);

  const hasAnyContent = allBookings.length > 0;
  const showLoading = isLoading && !hasAnyContent;

  if (showLoading) return <Loading message="Loading your bookings..." />;

  return (
    <div className='relative px-6 md:px-16 lg:px-40 pt-30 min-h-[80vh] mb-10'>
      {/* Blue glow band — same as Movies/MovieDetails pages */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[150%] h-45 rounded-[100%] blur-[120px] animate-slow-pulse pointer-events-none"
        style={{ top: '-20px', zIndex: 0, background: 'rgba(0, 123, 255, 0.5)' }}
      />
      <BlurCircle top='100px' left='100px' />
      <BlurCircle bottom='0px' right='200px' />

      <h1 className='relative z-10 text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-8'>My Bookings</h1>

      {allBookings.length > 0 ? (
        <div className="relative z-10 space-y-4 max-w-4xl">
          {allBookings.map((item, index) => {
            const posterUrl = getImageUrl(item.show?.movie?.poster_path);
            const isDemo = item.isDemo;
            const isPaid = item.isPaid;

            return (
              <AnimatedCard key={item._id || index} index={index} staggerDelay={60} duration={500}>
                {/* Card wrapper — compact, fixed height on md+ */}
                <div className={`relative flex flex-row overflow-hidden rounded-2xl border
                  transition-all duration-300 group h-32
                  ${isDemo
                    ? 'border-amber-500/25 hover:border-amber-500/50'
                    : isPaid
                      ? 'border-green-500/20 hover:border-green-500/40'
                      : 'border-primary/20 hover:border-primary/40'
                  }`}
                >
                  {/* Blurred background covering the ENTIRE card based on the movie poster */}
                  {posterUrl && (
                    <>
                      <img
                        src={posterUrl}
                        alt=""
                        aria-hidden="true"
                        className="absolute -inset-4 w-[calc(100%+2rem)] h-[calc(100%+2rem)] object-cover"
                        style={{ filter: 'blur(20px) brightness(0.35) saturate(1.5)' }}
                      />
                      {/* Gradient overlay to ensure text remains readable */}
                      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/30" />
                    </>
                  )}

                  <div className="relative z-10 flex flex-row w-full h-full">
                    {/* === LEFT: Poster === */}
                    <div className="relative w-22 shrink-0 overflow-hidden">
                      <img
                        src={posterUrl}
                        alt={item.show?.movie?.title || ''}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 shadow-xl"
                      />
                      {/* Status badge */}
                      <div className="absolute top-2 left-2">
                        {isDemo ? (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-black/60 border border-amber-500/50
                            rounded-md text-amber-400 text-[9px] font-bold uppercase backdrop-blur-sm">
                            <Sparkles className="w-2.5 h-2.5" />
                            Demo
                          </span>
                        ) : isPaid ? (
                          <span className="px-1.5 py-0.5 bg-black/60 border border-green-500/50
                            rounded-md text-green-400 text-[9px] font-bold uppercase backdrop-blur-sm">
                            ✓ Paid
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-black/60 border border-orange-500/50
                            rounded-md text-orange-400 text-[9px] font-bold uppercase backdrop-blur-sm">
                            Pending
                          </span>
                        )}
                      </div>
                    </div>

                    {/* === MIDDLE: Info === */}
                    <div className="flex-1 flex flex-col justify-center px-4 py-3 min-w-0">
                      <h3 className="text-base font-bold text-white truncate mb-2 leading-tight">
                        {item.show?.movie?.title || 'Unknown Movie'}
                      </h3>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-300">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span>{timeFormat(item.show?.movie?.runtime)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="truncate max-w-[120px]">{item.show?.hall || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Ticket className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span>{item.bookedSeats?.length || 0} seat{(item.bookedSeats?.length || 0) !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="font-semibold text-white">{currency}{item.amount}</span>
                        </div>
                      </div>

                      {/* Seat chips row */}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {(item.bookedSeats || []).slice(0, 8).map(seat => (
                          <span key={seat}
                            className="px-2 py-0.5 bg-primary/20 text-white text-[10px] font-bold rounded border border-primary/30 backdrop-blur-sm">
                            {seat}
                          </span>
                        ))}
                        {(item.bookedSeats?.length || 0) > 8 && (
                          <span className="text-[10px] text-gray-400">+{item.bookedSeats.length - 8}</span>
                        )}
                      </div>
                    </div>

                    {/* === RIGHT: Date + Actions === */}
                    <div className="relative w-40 shrink-0 flex flex-col items-end justify-between p-3">
                      {/* Date — top right */}
                      <p className="text-[10px] text-gray-300 text-right leading-tight">
                        {item.show?.showDateTime ? dateFormat(item.show.showDateTime) : 'Date N/A'}
                      </p>

                      {/* Action buttons — bottom right */}
                      <div className="flex items-center gap-2">
                        {/* Pay Now — shown for both demo and unpaid real bookings */}
                        {!isPaid && (
                          <button
                            onClick={handlePayNow}
                            className="px-3 py-1.5 bg-gradient-to-r from-[#F84565] to-[#D63854]
                              hover:from-[#D63854] hover:to-[#F84565] text-white font-semibold rounded-lg
                              shadow-md shadow-[#F84565]/25 hover:shadow-[#F84565]/50
                              hover:scale-105 active:scale-95 transition-all duration-300 text-[11px] whitespace-nowrap"
                          >
                            Pay Now
                          </button>
                        )}
                        {/* Delete — demo bookings only */}
                        {isDemo && (
                          <button
                            onClick={() => deleteDemoBooking(item._id)}
                            className="p-1.5 rounded-lg bg-black/40 hover:bg-red-500/30 border border-white/20
                              hover:border-red-500/50 text-gray-300 hover:text-white
                              transition-all duration-300 hover:scale-105 active:scale-95 backdrop-blur-md"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </AnimatedCard>
            );
          })}
        </div>
      ) : (
        <div className='relative z-10 mt-20 text-center'>
          <div className="inline-flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <Ticket className="w-10 h-10 text-gray-600" />
            </div>
            <p className='text-gray-400 text-xl'>You haven't booked any movies yet.</p>
            <p className="text-gray-600 text-sm">Browse movies and book your first ticket!</p>
          </div>
        </div>
      )}

      {/* You May Also Like Section */}
      {suggestions.length > 0 && (
        <div className="relative z-10 mt-20">
          <p className='text-2xl md:text-3xl font-bold text-white mb-6'>You May Also Like</p>
          <MovieGrid
            movies={suggestions}
            columns="sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            animated={true}
            staggerDelay={100}
          />
        </div>
      )}
    </div>
  );
};

export default MyBookings;