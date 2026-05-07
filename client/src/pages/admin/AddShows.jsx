import React, { useState, useEffect } from 'react';
import { dummyShowsData } from '../../assets/assets';
import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
// 1. Sửa lại import cho đúng chuẩn
import { StarIcon, XIcon, PlusIcon } from 'lucide-react'; 
import { kConverter } from '../../lib/kConverter';

const AddShows = () => {
  const currency = import.meta.env.VITE_CURRENCY || "$";
  const [nowPlayingMovies, setNowPlayingMovies] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  
  // Lưu trữ ngày giờ dưới dạng Object: { "2025-05-10": ["10:00", "14:00"], ... }
  const [dateTimeSelection, setDateTimeSelection] = useState({}); 
  const [dateTimeInput, setDateTimeInput] = useState("");
  const [showPrice, setShowPrice] = useState("");

  const fetchNowPlayingMovies = async () => {
    setNowPlayingMovies(dummyShowsData);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNowPlayingMovies();
  }, []);

  // Hàm xử lý khi người dùng bấm thêm một ngày/giờ chiếu mới
  const handleAddDateTime = () => {
    if (!dateTimeInput) return;

    const dateObj = new Date(dateTimeInput);
    const dateStr = dateObj.toISOString().split('T')[0]; // Lấy ngày (YYYY-MM-DD)
    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); // Lấy giờ (HH:MM)

    setDateTimeSelection((prev) => {
      const updatedSelection = { ...prev };
      // Nếu ngày này đã có trong danh sách, thêm giờ vào mảng
      if (updatedSelection[dateStr]) {
        if (!updatedSelection[dateStr].includes(timeStr)) {
          updatedSelection[dateStr].push(timeStr);
        }
      } else {
        // Nếu ngày mới, tạo mảng mới
        updatedSelection[dateStr] = [timeStr];
      }
      return updatedSelection;
    });

    setDateTimeInput(""); // Reset ô input
  };

  // Hàm xử lý xóa một giờ chiếu
  const handleRemoveTime = (date, timeToRemove) => {
    setDateTimeSelection((prev) => {
      const updatedSelection = { ...prev };
      updatedSelection[date] = updatedSelection[date].filter(time => time !== timeToRemove);
      
      // Nếu ngày đó không còn giờ nào, xóa luôn ngày đó đi
      if (updatedSelection[date].length === 0) {
        delete updatedSelection[date];
      }
      return updatedSelection;
    });
  };

  // Hàm Submit giả lập
  const handleSubmit = () => {
    if (!selectedMovie || !showPrice || Object.keys(dateTimeSelection).length === 0) {
        alert("Vui lòng nhập đầy đủ phim, giá vé và ít nhất 1 suất chiếu!");
        return;
    }
    console.log("Dữ liệu chuẩn bị gửi lên Server:", {
        movieId: selectedMovie._id,
        price: showPrice,
        shows: dateTimeSelection
    });
    alert("Thêm suất chiếu thành công (Xem console)!");
    // Sau khi thêm xong, có thể reset form tại đây
  };

  return nowPlayingMovies.length > 0 ? (
    <>
      <Title text1="Add " text2="Show" />
      <p className='mt-10 text-lg font-medium'>Now Playing Movies</p>
      
      {/* 2. HIỂN THỊ DANH SÁCH PHIM */}
      <div className='overflow-x-auto pb-4'>
        <div className='group flex flex-wrap gap-4 mt-4 w-max'>
          {nowPlayingMovies.map((movie) => (
            <div 
                key={movie.id} 
                onClick={() => setSelectedMovie(movie)} // Xử lý chọn phim
                className={`relative max-w-40 cursor-pointer transition duration-300 rounded-lg overflow-hidden border-2
                    ${selectedMovie?.id === movie.id ? 'border-primary' : 'border-transparent group-hover:not-hover:opacity-40 hover:-translate-y-1'}`}
            >
              <div className='relative'>
                <img src={movie.poster_path} alt="" className='w-full object-cover brightness-90' />
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

      {/* 3. KHU VỰC FORM (Chỉ hiện khi đã chọn 1 bộ phim) */}
      {selectedMovie && (
        <div className='mt-10 max-w-4xl bg-primary/5 border border-primary/20 p-6 rounded-lg'>
            <h2 className='text-xl font-bold mb-6 text-white'>
                Set Shows for: <span className="text-primary">{selectedMovie.title}</span>
            </h2>

            <div className='flex flex-col md:flex-row gap-6'>
                {/* Cột nhập Giá */}
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

                {/* Cột nhập Ngày/Giờ */}
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

            {/* Hiển thị các suất chiếu đã chọn */}
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

            {/* Nút Submit */}
            <div className='mt-8 text-right'>
                <button 
                    onClick={handleSubmit}
                    className='bg-linear-to-r from-primary to-primary-dull hover:shadow-lg hover:shadow-primary/50 text-white font-medium px-8 py-3 rounded-md transition transform hover:scale-105 active:scale-95'
                >
                    Add Shows
                </button>
            </div>
        </div>
      )}
    </>
  ) : <Loading />;
}

export default AddShows;