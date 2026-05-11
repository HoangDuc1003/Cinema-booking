import { ChartLineIcon, CircleDollarSignIcon, PlaySquareIcon, StarIcon, UserIcon } from 'lucide-react';
import React, { useEffect, useState } from 'react'
import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
import BlurCircle from '../../components/BlurCircle';
import { dateFormat } from '../../lib/dateFormat'
import { useAppContext } from '../../context/AppContext';
import toast from "react-hot-toast";

const Dashboard = () => {
  const { axios, getToken, user } = useAppContext();
  const currency = import.meta.env.VITE_CURRENCY;
  const [dashboardData, setDashboardData] = useState({
    totalBookings: 0,
    totalRevenue: 0,
    activeShows: [],
    totalUser: 0
  });

  const [loading, setLoading] = useState(true);

  const dashboardCards = [
    {
      title: "Total Bookings",
      value: dashboardData.totalBookings || "0",
      icon: ChartLineIcon
    },
    {
      title: "Total Revenue",
      value: currency + dashboardData.totalRevenue || "0",
      icon: CircleDollarSignIcon
    },
    {
      title: "Active Shows",
      value: dashboardData.activeShows.length || "0",
      icon: PlaySquareIcon
    },
    {
      title: "Total User",
      value: dashboardData.totalUser || "0",
      icon: UserIcon
    },
  ];

  const fetchDashBoardData = async () => {
    try {
      const { data } = await axios.get('/api/admin/dashboard', {
        headers: { Authorization: `Bearer ${await getToken()}` }})
      if (data.success) {
        setDashboardData(data.dashboardData)
        setLoading(false)

      } else {
        toast.error(data.message)
        setLoading(false)
      }
    } catch (error) {
      toast.error("Error Fetching Dashboard Data: ", error);
      setLoading(false)
    }
  };

  useEffect(() => {
    if (user) {
      fetchDashBoardData();
    }
  }, [user])

  return !loading ? (
    <>
      <Title text1="Admin " text2="DashBoard" />
      <div className='relative flex flex-wrap gap-4 mt-6'>
        <BlurCircle top="-100px" left='0' />
        <BlurCircle top="200px" right='0' />
        <BlurCircle top="500px" left='0' />
        <BlurCircle bottom="0" right='0' />
        <div className='flex flex-wrap gap-4 w-full'>
          {dashboardCards.map((card, index) => (
            <div key={index} className='flex items-center justify-between px-4 py-3 bg-primary/10 
          border border-primary/20 rounded-md max-w-50 w-full'>
              <div>
                <h1 className='text-sm'>{card.title}</h1>
                <p className='text-xl font-medium'>{card.value}</p>
              </div>
              <card.icon className='w-6 h-6' />
            </div>
          ))}
        </div>
      </div>
      <p className='relative text-2xl md:text-3xl lg:text-4xl font-bold text-white mt-8 '>
        Active Shows
      </p>
      <div className='relative flex flex-wrap gap-6 mt-4 max-w-5xl'>
        {dashboardData.activeShows && dashboardData.activeShows.filter(s => s.movie).map((show) => (
          <div key={show.id} className="w-55 rounded-lg overflow-hidden h-full pb-3 bg-primary/10 border border-primary/20 
          hover:-translate-y-1 transition duration-300">
            <img
              src={`https://image.tmdb.org/t/p/w500${show.movie.poster_path}`}
              alt=""
              className='h-60 w-full object-cover' />
            <p className='font-medium p-2 truncate'>{show.movie.title}</p>
            <div className='flex items-center justify-between px-2'>
              <p className='text-lg font-medium'>{currency}{show.showPrice}</p>
              <p className='flex items-center gap-1 text-sm text-gray-400 mt-1 pr-1'>
                <StarIcon className='w-4 h-4 text-primary fill-primary' />
                {show.movie.vote_average?.toFixed(1)}
              </p>
            </div>
            <p className='px-2 pt-2 text-sm text-gray-500'>{dateFormat(show.showDateTime)}</p>
          </div>
        ))}
      </div>
    </>
  ) : <Loading />
}

export default Dashboard;