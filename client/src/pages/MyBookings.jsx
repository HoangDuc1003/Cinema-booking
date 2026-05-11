import React, { useState, useEffect } from 'react'
import Loading from '../components/Loading'
import BlurCircle from '../components/BlurCircle'
import timeFormat from '../lib/timeFormat'
import { dateFormat } from '../lib/dateFormat'
import { useAppContext } from '../context/AppContext'
import toast from 'react-hot-toast'

const MyBookings = () => {
  const currency = import.meta.env.VITE_CURRENCY
  const [bookings, setBookings] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const { getToken, user, axios } = useAppContext();

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `https://image.tmdb.org/t/p/w500${path}`;
  };

  const getMyBookings = async () => {
    try {
      const { data } = await axios.get('/api/booking/my-bookings', {
        headers: { Authorization: `Bearer ${await getToken()}` }
      });
      if (data.success) {
        setBookings(data.bookings);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to load bookings");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      getMyBookings()
    } else {
      setIsLoading(false);
    }
  }, [user])

  return !isLoading ? (
    <div className='relative px-6 md:px-16 lg:px-40 pt-30 md:pt-40 min-h-80vh mb-10'>
      <BlurCircle top='100px' left='100px' />
      <div>
        <BlurCircle bottom='0px' left='600px' />
      </div>
      <h1 className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2'>My Bookings</h1>
      {bookings.length > 0 ? (
        bookings.map((item, index) => (
          <div key={index} className='flex flex-col md:flex-row justify-between bg-primary/8 border border-primary/20 rounded-lg mt-4 p-2 max-w-3xl '>
            <div className='flex flex-col md:flex-row'>
              <img src={getImageUrl(item.show?.movie?.poster_path)} alt="" className='md:max-w-45 aspect-video h-auto object-cover object-bottom rounded' />
              <div className='flex flex-col p-4'>
                <p className='text-lg font-semibold'>{item.show?.movie?.title || 'Unknown Movie'}</p>
                <p className='text-gray-400 text-sm'>{timeFormat(item.show?.movie?.runtime)}</p>
                <p className='text-gray-400 text-sm mt-auto'>{dateFormat(item.show?.showDateTime)}</p>
              </div>
            </div>
            <div className='flex flex-col md:items-end md:text-right justify-between p-4 '>
              <div className='flex items-center gap-4 '>
                <p className='text-2xl font-semibold mb-2'>{currency}{item.amount}</p>
                {!item.isPaid && <button className="group flex items-center gap-3 px-4 py-1.5 bg-linear-to-r from-primary to-primary-dull hover:from-primary-dull hover:to-primary text-white font-semibold rounded-full shadow-lg shadow-primary/30 hover:shadow-xs hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 border border-primary/30 hover:border-primary/60 relative overflow-hidden mb-2">Pay Now</button>}
              </div>
              <div className='text-sm'>
                <p><span className='text-gray-400'>Total Tickets:</span>{item.bookedSeats.length}</p>
                <p><span className='text-gray-400'>Seat Number:</span>{item.bookedSeats.join(", ")}</p>
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className='mt-20 text-center'>
          <p className='text-gray-400 text-xl'>You haven't booked any movies yet.</p>
        </div>
      )}
    </div>
  ) : (
    <Loading />
  )
}

export default MyBookings