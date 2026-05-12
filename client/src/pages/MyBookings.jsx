import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Loading from '../components/Loading'
import BlurCircle from '../components/BlurCircle'
import AnimatedCard from '../components/AnimatedCard'
import timeFormat from '../lib/timeFormat'
import { dateFormat } from '../lib/dateFormat'
import { useAppContext } from '../context/AppContext'
import { Ticket, Clock, MapPin, CreditCard, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import MovieGrid from '../components/MovieGrid'
import { fetchPopularMovies } from '../services/tmdb'

const MyBookings = () => {
  const currency = import.meta.env.VITE_CURRENCY || '$'
  const [bookings, setBookings] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const { user, axios } = useAppContext();

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `https://image.tmdb.org/t/p/w500${path}`;
  };

  // Fetch bookings and suggestions on mount
  useEffect(() => {
    let mounted = true;
    fetchPopularMovies().then(data => {
      if (mounted) setSuggestions(Array.isArray(data) ? data.slice(0, 4) : []);
    }).catch(() => {});

    const loadBookings = async () => {
      if (!user) { setIsLoading(false); return; }
      try {
        const { data } = await axios.get('/api/booking/my-bookings');
        if (mounted && data.success) setBookings(data.bookings || []);
      } catch { /* backend unavailable */ }
      finally { if (mounted) setIsLoading(false); }
    };
    loadBookings();
    return () => { mounted = false; };
  }, [user]);

  // Sort newest first
  const sortedBookings = useMemo(() => {
    return [...bookings].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [bookings]);

  // Calculate unpaid totals
  const unpaidBookings = useMemo(() => sortedBookings.filter(b => !b.isPaid), [sortedBookings]);
  const totalAmount = useMemo(() => unpaidBookings.reduce((sum, b) => sum + Number(b.amount || 0), 0), [unpaidBookings]);

  // Pay Now → create Stripe session and redirect to checkout
  const handlePayNow = useCallback(async (item) => {
    const toastId = toast.loading('Redirecting to payment...', {
      style: { background: '#1a1a1a', color: '#fff', border: '1px solid #333' }
    });
    try {
      const { data } = await axios.post('/api/booking/pay-now', { bookingId: item._id });
      if (data.success) {
        toast.dismiss(toastId);
        window.location.href = data.url;
      } else {
        toast.error(data.message || 'Payment failed', { id: toastId });
      }
    } catch (error) {
      toast.error(error.message || 'Payment error', { id: toastId });
    }
  }, [axios]);

  // Delete unpaid booking
  const handleDelete = useCallback(async (id) => {
    const toastId = toast.loading('Deleting booking...', {
      style: { background: '#1a1a1a', color: '#fff', border: '1px solid #333' }
    });
    try {
      const { data } = await axios.delete(`/api/booking/${id}`);
      if (data.success) {
        toast.success('Booking deleted', { id: toastId });
        setBookings(prev => prev.filter(b => b._id !== id));
      } else {
        toast.error(data.message || 'Failed to delete', { id: toastId });
      }
    } catch (error) {
      toast.error(error.message || 'Error deleting booking', { id: toastId });
    }
  }, [axios]);

  // Pay All
  const handlePayAll = useCallback(async () => {
    if (!unpaidBookings.length) return;
    const toastId = toast.loading('Processing payment...', {
      style: { background: '#1a1a1a', color: '#fff', border: '1px solid #333' }
    });
    try {
      const { data } = await axios.post('/api/booking/pay-all', {});
      if (data.success) {
        toast.dismiss(toastId);
        window.location.href = data.url;
      } else {
        toast.error(data.message || 'Payment failed', { id: toastId });
      }
    } catch (error) {
      toast.error(error.message || 'Payment error', { id: toastId });
    }
  }, [axios, unpaidBookings]);

  if (isLoading && !sortedBookings.length) return <Loading message="Loading your bookings..." />;

  return (
    <div className='relative px-4 sm:px-6 md:px-16 lg:px-40 pt-24 sm:pt-30 min-h-[80vh] mb-10'>
      {/* Background effects */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[120%] sm:w-[150%] h-45 rounded-[100%] blur-[120px] animate-slow-pulse pointer-events-none"
        style={{ top: '-20px', zIndex: 0, background: 'rgba(0, 123, 255, 0.5)' }}
      />
      <BlurCircle top='100px' left='100px' />
      <BlurCircle bottom='0px' right='200px' />

      <h1 className='relative z-10 text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-8'>My Bookings</h1>

      {sortedBookings.length > 0 ? (
        <div className="relative z-10 flex flex-col lg:flex-row gap-8">
          <div className="flex-1 space-y-4">
            {sortedBookings.map((item, index) => {
            const posterUrl = getImageUrl(item.show?.movie?.poster_path);
            const isPaid = item.isPaid;

            return (
              <AnimatedCard key={item._id || index} index={index} staggerDelay={60} duration={500}>
                {/* Booking card */}
                <div className={`relative flex flex-row overflow-hidden rounded-2xl border
                  transition-all duration-300 group min-h-[7rem] sm:h-32
                  ${isPaid
                    ? 'border-green-500/20 hover:border-green-500/40'
                    : 'border-primary/20 hover:border-primary/40'
                  }`}
                >
                  {/* Blurred poster background */}
                  {posterUrl && (
                    <>
                      <img
                        src={posterUrl} alt="" aria-hidden="true"
                        className="absolute -inset-4 w-[calc(100%+2rem)] h-[calc(100%+2rem)] object-cover"
                        style={{ filter: 'blur(20px) brightness(0.35) saturate(1.5)' }}
                      />
                      <div className="absolute inset-0 bg-linear-to-r from-black/80 via-black/50 to-black/30" />
                    </>
                  )}

                  <div className="relative z-10 flex flex-row w-full h-full">
                    {/* Poster */}
                    <div className="relative w-18 sm:w-22 shrink-0 overflow-hidden">
                      <img
                        src={posterUrl}
                        alt={item.show?.movie?.title || ''}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 shadow-xl"
                      />
                      {/* Status badge */}
                      <div className="absolute top-2 left-2">
                        {isPaid ? (
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

                    {/* Booking info */}
                    <div className="flex-1 flex flex-col justify-center px-2.5 sm:px-4 py-2 sm:py-3 min-w-0">
                      <h3 className="text-sm sm:text-base font-bold text-white truncate mb-1 sm:mb-2 leading-tight">
                        {item.show?.movie?.title || 'Unknown Movie'}
                      </h3>
                      <div className="flex flex-wrap gap-x-2 sm:gap-x-4 gap-y-0.5 sm:gap-y-1 text-[10px] sm:text-xs text-gray-300">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary shrink-0" />
                          <span>{timeFormat(item.show?.movie?.runtime)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary shrink-0" />
                          <span className="truncate max-w-[80px] sm:max-w-[120px]">{item.show?.hall || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Ticket className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary shrink-0" />
                          <span>{item.bookedSeats?.length || 0} seat{(item.bookedSeats?.length || 0) !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CreditCard className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary shrink-0" />
                          <span className="font-semibold text-white">{currency}{item.amount}</span>
                        </div>
                      </div>
                      {/* Seat chips */}
                      <div className="flex items-center gap-1 sm:gap-1.5 mt-1.5 sm:mt-2 flex-wrap">
                        {(item.bookedSeats || []).slice(0, 6).map(seat => (
                          <span key={seat}
                            className="px-1.5 sm:px-2 py-0.5 bg-primary/20 text-white text-[9px] sm:text-[10px] font-bold rounded border border-primary/30 backdrop-blur-sm">
                            {seat}
                          </span>
                        ))}
                        {(item.bookedSeats?.length || 0) > 6 && (
                          <span className="text-[9px] sm:text-[10px] text-gray-400">+{item.bookedSeats.length - 6}</span>
                        )}
                      </div>
                    </div>

                    {/* Date and actions */}
                    <div className="relative w-28 sm:w-40 shrink-0 flex flex-col items-end justify-between p-2 sm:p-3">
                      <p className="text-[9px] sm:text-[10px] text-gray-300 text-right leading-tight">
                        {item.show?.showDateTime ? dateFormat(item.show.showDateTime) : 'Date N/A'}
                      </p>
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        {!isPaid && (
                          <>
                            <button
                              onClick={() => handlePayNow(item)}
                              className="px-2 sm:px-3 py-1 sm:py-1.5 bg-gradient-to-r from-[#F84565] to-[#D63854]
                                hover:from-[#D63854] hover:to-[#F84565] text-white font-semibold rounded-lg
                                shadow-md shadow-[#F84565]/25 hover:shadow-[#F84565]/50
                                hover:scale-105 active:scale-95 transition-all duration-300 text-[10px] sm:text-[11px] whitespace-nowrap"
                            >
                              Pay Now
                            </button>
                            <button
                              onClick={() => handleDelete(item._id)}
                              className="p-1 sm:p-1.5 bg-black/40 hover:bg-red-500/20 text-gray-400 hover:text-red-500 rounded-lg border border-white/5 hover:border-red-500/30 transition-all duration-300"
                              title="Delete booking"
                            >
                              <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </AnimatedCard>
            );
          })}
          </div>

          {/* Right Sidebar - Total Invoice */}
          {unpaidBookings.length > 0 && (
            <div className="w-full lg:w-[350px] shrink-0">
              <div className="sticky top-30 bg-[#1a1a1a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-4">Order Summary</h3>
                
                <div className="space-y-3 mb-6 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                  {unpaidBookings.map(b => (
                    <div key={b._id} className="flex justify-between items-center text-sm">
                      <span className="text-gray-300 truncate pr-4">{b.show?.movie?.title || 'Unknown'} (x{b.bookedSeats?.length || 1})</span>
                      <span className="text-white font-medium whitespace-nowrap">{currency}{b.amount}</span>
                    </div>
                  ))}
                </div>
                
                <div className="border-t border-white/10 pt-4 mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400">Subtotal</span>
                    <span className="text-white font-semibold">{currency}{totalAmount}</span>
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-gray-400">Fees & Taxes</span>
                    <span className="text-green-400 font-medium">Included</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-lg font-bold text-white">Total</span>
                    <span className="text-2xl font-bold text-primary">{currency}{totalAmount}</span>
                  </div>
                </div>

                <button
                  onClick={handlePayAll}
                  className="w-full py-3.5 bg-gradient-to-r from-primary to-purple-600 
                    hover:from-purple-600 hover:to-primary text-white font-bold rounded-xl
                    shadow-lg shadow-primary/25 hover:shadow-primary/40 
                    transition-all duration-300 hover:-translate-y-1 active:translate-y-0"
                >
                  Pay All Now ({unpaidBookings.length})
                </button>
              </div>
            </div>
          )}
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

      {/* Suggestions */}
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