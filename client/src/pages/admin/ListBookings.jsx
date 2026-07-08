import React, { useEffect, useState } from 'react'
import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
import { dateFormat } from '../../lib/dateFormat'; 
import BlurCircle from '../../components/BlurCircle';
import { useAppContext } from '../../context/AppContext';
import toast from 'react-hot-toast'

const ListBookings = () => {
  const {axios,getToken,user} = useAppContext();
  const currency = import.meta.env.VITE_CURRENCY
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const getAllBookings = async () => {
    try {
      const { data } = await axios.get('/api/admin/all-bookings',{
        headers: {Authorization: `Bearer ${await getToken()}` }
      })
      setBookings(data.bookings);
      setIsLoading(false);
    } catch (error) {
      toast.error(error.message);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if(user){
      // eslint-disable-next-line react-hooks/set-state-in-effect
      getAllBookings();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user]);

  return !isLoading ? (
    <>
      <Title text1="List " text2="Bookings" />
      <div className='relative flex flex-wrap gap-4 mt-6'>
        <BlurCircle top="-100px" left='0'/>
        <BlurCircle top="200px" right='0'/>
        <BlurCircle top="500px" left='0'/>
        <BlurCircle bottom="0" right='0'/>
      
      <div className='max-w-4xl mt-6 overflow-x-auto w-full'>
        <table className='w-full border-collapse rounded-md overflow-hidden text-nowrap'>
          <thead>
            <tr className='bg-primary/20 text-left text-white'>
              <th className='p-2 font-medium pl-5'>User Name</th>
              <th className='p-2 font-medium'>Movies Name</th>
              <th className='p-2 font-medium'> Show Time</th>
              <th className='p-2 font-medium'>Seats</th>
              <th className='p-2 font-medium'>Amount</th>
            </tr>
          </thead>

          <tbody className="text-sm font-light text-white">
            {bookings.map((item, index) => (
              <tr key={index} className="border-b border-primary/20 bg-primary/5 even:bg-primary/10">
                <td className="p-2 min-w-45 pl-5">{item.user.name}</td>
                <td className="p-2">{item.show.movie.title}</td>
                <td className="p-2">{dateFormat(item.show.showDateTime)}</td>
                <td className="p-2">{item.bookedSeats.join(", ")}</td> 
                <td className="p-2">{currency}{item.amount}</td>
              </tr>
            ))}
          </tbody>

        </table>
      </div>
    </div>
    </>
  ) : <Loading />
}

export default ListBookings;
