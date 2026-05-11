import React, { useState, useEffect } from 'react';
import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
import BlurCircle from '../../components/BlurCircle';
import { StarIcon, XIcon, PlusIcon } from 'lucide-react'; 
import { kConverter } from '../../lib/kConverter';
import { useAppContext } from '../../context/AppContext';
import toast from 'react-hot-toast'

const AddShows = () => {
  const {axios,getToken,user} = useAppContext();
  const currency = import.meta.env.VITE_CURRENCY || "$";
  const [nowPlayingMovies, setNowPlayingMovies] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [dateTimeSelection, setDateTimeSelection] = useState({}); 
  const [dateTimeInput, setDateTimeInput] = useState("");
  const [showPrice, setShowPrice] = useState("");
  const [addShow,setAddShow] = useState(false);

  const fetchNowPlayingMovies = async () => {
    try{
      const { data } = await axios.get('/api/show/now-playing', {
        headers: { Authorization: `Bearer ${await getToken()}` }
      });
      if (data.success) {
        setNowPlayingMovies(data.movies);
      }
    }catch(error){
      console.log("Error fetching movies:",error)
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNowPlayingMovies();
  }, []);

  // Add a new showtime
  const handleAddDateTime = () => {
    if (!dateTimeInput) return;

    const dateObj = new Date(dateTimeInput);
    const dateStr = dateObj.toISOString().split('T')[0];
    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setDateTimeSelection((prev) => {
      const updatedSelection = { ...prev };
      // Add time to existing date or create new date entry
      if (updatedSelection[dateStr]) {
        if (!updatedSelection[dateStr].includes(timeStr)) {
          updatedSelection[dateStr].push(timeStr);
        }
      } else {
        
        updatedSelection[dateStr] = [timeStr];
      }
      return updatedSelection;
    });

    setDateTimeInput("");
  };

  // Remove a showtime
  const handleRemoveTime = (date, timeToRemove) => {
    setDateTimeSelection((prev) => {
      const updatedSelection = { ...prev };
      updatedSelection[date] = updatedSelection[date].filter(time => time !== timeToRemove);
      
      // Remove date if no times left
      if (updatedSelection[date].length === 0) {
        delete updatedSelection[date];
      }
      return updatedSelection;
    });
  };

  // Submit handler (mock)
  const handleSubmit = async() => {
    try {
      setAddShow(true)
      if (!selectedMovie || !showPrice || Object.keys(dateTimeSelection).length === 0) {
        toast.error("Please fill in movie, price and at least 1 showtime!");
        setAddShow(false)
        return;
      }
      
      const showInput = Object.entries(dateTimeSelection).map(([date,times]) => ({date,times}))
      const payload ={
        movieId : selectedMovie.id, 
        showInput,
        showPrice:Number(showPrice)
      }

      const { data } = await axios.post('/api/show/add',payload,{
        headers : {Authorization: `Bearer ${await getToken()}`}
      })

      if(data.success){
        toast.success(data.message)
        setDateTimeSelection({})
        setShowPrice("")
        setSelectedMovie(null)
        // eslint-disable-next-line no-undef
        await fetchShows()
      }else{
        toast.error(data.message)
      }
    } catch (error) {
      console.error("Submission error: ",error);
      toast.error("Error adding show. Please try again.");
    }
    setAddShow(false)
  };

  return nowPlayingMovies.length > 0 ? (
    <>
      <Title text1="Add " text2="Show" />
      <div className='relative flex flex-wrap gap-4 '>
        <BlurCircle top="-100px" left='0'/>
        <BlurCircle top="200px" right='0'/>
        <BlurCircle top="500px" left='0'/>
        <BlurCircle bottom="0" right='0'/>
      <p className='text-lg font-medium'>Now Playing Movies</p>
      </div>
      {/* Movie list */}
      <div className='overflow-x-auto pb-4'>
        <div className='group flex flex-wrap gap-4 mt-4 w-max'>
          {nowPlayingMovies.map((movie) => (
            <div 
                key={movie.id} 
                onClick={() => setSelectedMovie(movie)}
                className={`relative max-w-35 cursor-pointer transition duration-300 rounded-lg overflow-hidden border-2
                    ${selectedMovie?.id === movie.id ? 'border-primary' : 'border-transparent group-hover:not-hover:opacity-40 hover:-translate-y-1'}`}
            >
              <div className='relative'>
               <img 
                  src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`} 
                  alt={movie.title} 
                  className='w-full object-cover brightness-90' 
                />
                <div className='text-sm flex items-center justify-between p-2 bg-black/70 w-full absolute left-0 bottom-0'>
                  <p className='flex items-center gap-1 text-gray-400'>
                    <StarIcon className="w-4 h-4 text-primary fill-primary" />
                    {movie.vote_average.toFixed(1)}
                  </p>
                  <p className='text-gray-300 '>{kConverter(movie.vote_count)} Votes</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Show form (always visible) */}
        <div className='mt-10 max-w-4xl bg-primary/5 border border-primary/20 p-6 rounded-lg'>
            <h2 className='text-xl font-bold mb-6 text-white'>
                Set Shows for: <span className="text-primary">{selectedMovie?.title || "No Movie Selected"}</span>
            </h2>

            <div className='flex flex-col md:flex-row gap-6'>
                {/* Price input */}
                <div className='flex-1'>
                    <label className='block text-sm font-medium text-gray-300 mb-2'>Show Price ({currency})</label>
                    <input 
                        type="number" 
                        value={showPrice}
                        onChange={(e) => setShowPrice(e.target.value)}
                        className='w-full bg-white/5 border border-white/20 p-3 rounded-md text-white outline-none focus:border-primary transition'
                        placeholder='Enter ticket price...'
                    />
                </div>

                {/* Date/time input */}
                <div className='flex-1'>
                    <label className='block text-sm font-medium text-gray-300 mb-2'>Select Date & Time</label>
                    <div className='flex items-center gap-3'>
                        <input 
                            type="datetime-local" 
                            value={dateTimeInput}
                            onChange={(e) => setDateTimeInput(e.target.value)}
                            className='flex-1 bg-white/5 border border-white/20 p-3 rounded-md text-white outline-none focus:border-primary transition custom-datetime'
                        />
                        <button 
                            onClick={handleAddDateTime}
                            className='bg-primary/20 text-primary border border-primary hover:bg-primary hover:text-white p-3 rounded-md transition flex items-center justify-center'
                        >
                            <PlusIcon className='w-6 h-6'/>
                        </button>
                    </div>
                </div>
            </div>

            {/* Selected showtimes */}
            {Object.keys(dateTimeSelection).length > 0 && (
                <div className='mt-8'>
                    <p className='text-gray-300 mb-3'>Selected Timings:</p>
                    <div className='flex flex-col gap-4'>
                        {Object.entries(dateTimeSelection).map(([date, times]) => (
                            <div key={date} className='flex flex-col sm:flex-row sm:items-center gap-4 bg-black/20 p-4 rounded-md'>
                                <span className='text-primary font-medium w-28'>{date}</span>
                                <div className='flex flex-wrap gap-2'>
                                    {times.map((time, idx) => (
                                        <span key={idx} className='flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-sm'>
                                            {time}
                                            <XIcon 
                                                className='w-3 h-3 cursor-pointer hover:text-red-400' 
                                                onClick={() => handleRemoveTime(date, time)}
                                            />
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Submit button */}
            <div className='mt-8 text-right'>
                <button 
                    onClick={handleSubmit}
                    disabled = {addShow}
                    className='bg-linear-to-r from-primary to-primary-dull hover:shadow-lg hover:shadow-primary/50 text-white font-medium px-8 py-3 rounded-md transition transform hover:scale-105 active:scale-95'
                >
                    Add Shows
                </button>
            </div>
        </div>
    </>
  ) : <Loading />;
}

export default AddShows;