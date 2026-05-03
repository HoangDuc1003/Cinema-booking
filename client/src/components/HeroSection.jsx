import React, { useState, useEffect, useMemo } from 'react'
import { CalendarIcon, ClockIcon, PlayIcon, Film, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import timeFormat from '../lib/timeFormat'

const HeroSection = () => {
  const { image_base_url, shows } = useAppContext()
  const [isLoaded, setIsLoaded] = useState(false)
  const [currentMovieIndex, setCurrentMovieIndex] = useState(0)
  const [titleAnimationKey, setTitleAnimationKey] = useState(0)
  const navigate = useNavigate()

  // 1. FIX LỖI `Math.random()`: Sắp xếp theo điểm số ổn định thay vì random
  const heroMovies = useMemo(() => {
    if (!shows || shows.length === 0) return []

    const uniqueMoviesMap = new Map()
    shows.forEach(movie => {
      if (movie && movie._id && !uniqueMoviesMap.has(movie._id)) {
        uniqueMoviesMap.set(movie._id, movie)
      }
    })

    const uniqueMovies = Array.from(uniqueMoviesMap.values())
    // Sắp xếp theo rating cao nhất giảm dần
    const sortedMovies = uniqueMovies.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
    
    // Lấy 4 phim đầu tiên
    return sortedMovies.slice(0, Math.min(4, sortedMovies.length))
  }, [shows])

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (heroMovies.length <= 1) return
    const rotateInterval = setInterval(() => {
      setCurrentMovieIndex(prev => (prev + 1) % heroMovies.length)
      setTitleAnimationKey(prev => prev + 1)
    }, 5000)
    return () => clearInterval(rotateInterval)
  }, [heroMovies.length])

  const currentMovie = heroMovies[currentMovieIndex]

  if (!shows || shows.length === 0 || !currentMovie) {
    return (
      <div className='relative flex flex-col items-start justify-center gap-6 px-6 md:px-16 lg:px-36 h-screen text-white overflow-hidden'>
        <div className='absolute inset-0 bg-linear-to-br from-black via-gray-900 to-black'></div>
        <div className='relative z-10 flex flex-col items-center justify-center w-full h-full'>
          <div className='animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mb-4'></div>
          <p className='text-gray-400 text-lg'>Đang tải dữ liệu...</p>
        </div>
      </div>
    )
  }

  const genreMap = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
    53: 'Thriller', 10752: 'War', 37: 'Western'
  }

  return (
    <div className='relative flex flex-col items-start justify-center gap-6 px-6 md:px-16 lg:px-36 h-screen text-white overflow-hidden'>
      
      {/* Nền phim động */}
      <div
        className='absolute inset-0 bg-cover bg-center transform scale-110 transition-all duration-1000 brightness-50'
        style={{ backgroundImage: `url(${image_base_url}${currentMovie.backdrop_path})` }}
      ></div>

      {/* 2. TAILWIND v4: Cập nhật bg-linear thay cho bg-gradient */}
      <div className='absolute inset-0 bg-linear-to-r from-black/80 via-black/40 to-black/20 animate-pulse' style={{ animationDuration: '8s' }}></div>
      <div className='absolute inset-0 bg-linear-to-b from-transparent via-black/20 to-black/70'></div>
      <div className='absolute inset-0 bg-linear-to-tr from-primary/30 via-transparent to-transparent animate-pulse' style={{ animationDuration: '6s' }}></div>

      {/* 3. HIỆU ỨNG HẠT (Dùng inline style thay vì duration-[] để tương thích 100% mọi phiên bản) */}
      <div className='absolute top-20 left-20 w-3 h-3 bg-primary/90 rounded-full animate-bounce' style={{ animationDuration: '4s' }}></div>
      <div className='absolute top-40 right-32 w-2 h-2 bg-white/70 rounded-full animate-ping' style={{ animationDuration: '3s', animationDelay: '1s' }}></div>
      <div className='absolute bottom-40 left-16 w-2 h-2 bg-primary/90 rounded-full animate-pulse' style={{ animationDuration: '5s', animationDelay: '2s' }}></div>
      <div className='absolute top-60 right-20 w-1 h-1 bg-white/60 rounded-full animate-bounce' style={{ animationDelay: '0.5s' }}></div>
      <div className='absolute top-80 left-1/3 w-1.5 h-1.5 bg-primary/80 rounded-full animate-ping' style={{ animationDuration: '4s', animationDelay: '1.5s' }}></div>
      <div className='absolute bottom-60 right-1/4 w-2 h-2 bg-white/50 rounded-full animate-pulse' style={{ animationDuration: '6s', animationDelay: '3s' }}></div>

      {/* Nội dung chính */}
      <div className='relative z-10 max-w-3xl'>
        
        {/* Tiêu đề phim (Gọi animation từ file index.css) */}
        <h1 key={`title-${titleAnimationKey}`} className='text-4xl md:text-5xl lg:text-7xl font-bold leading-tight mb-6 animate-fade-in'>
          {currentMovie.title.split(' ').map((word, index) => (
            <span 
              key={`${word}-${index}-${titleAnimationKey}`}
              className={`inline-block mr-3 mb-2 bg-linear-to-r from-white via-gray-100 to-white bg-clip-text text-transparent ${
                index === 0 ? 'animate-slide-in-left' : index === 1 ? 'animate-slide-in-right' : 'animate-zoom-in'
              }`}
            >
              {word}
            </span>
          ))}
        </h1>

        {/* Thể loại */}
        <div className={`flex flex-wrap items-center gap-4 md:gap-6 mb-6 text-sm md:text-base transition-all duration-1000 delay-500 ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
          <div className='flex items-center gap-2'>
            {currentMovie.genre_ids?.slice(0, 3).map((genreId, index) => (
              <span key={`${genreId}-${index}`} className='px-3 py-1 bg-white/15 rounded-full backdrop-blur-sm border border-white/30 hover:bg-white/25 hover:scale-105 hover:border-primary/40 transition-all duration-300 cursor-pointer'>
                {genreMap[genreId] || 'Drama'}
              </span>
            ))}
          </div>
        </div>

        {/* Thông tin thời lượng, đánh giá */}
        <div className={`flex items-center gap-6 mb-6 text-white/90 transition-all duration-1000 delay-700 ${isLoaded ? 'translate-x-0 opacity-100' : '-translate-x-10 opacity-0'}`}>
          <div className='flex items-center gap-2 hover:text-white hover:scale-110 transition-all duration-300 cursor-pointer'>
            <CalendarIcon className='w-5 h-5 text-primary animate-pulse' style={{ animationDuration: '3s' }} />
            <span className='font-medium'>{currentMovie.release_date ? new Date(currentMovie.release_date).getFullYear() : '2024'}</span>
          </div>
          <div className='flex items-center gap-2 hover:text-white hover:scale-110 transition-all duration-300 cursor-pointer'>
            <ClockIcon className='w-5 h-5 text-primary animate-pulse' style={{ animationDuration: '3s' }} />
            <span className='font-medium'>{currentMovie.runtime ? timeFormat(currentMovie.runtime) : '2h 0m'}</span>
          </div>
          <div className='flex items-center gap-2 hover:text-white hover:scale-110 transition-all duration-300 cursor-pointer'>
            <Star className='w-5 h-5 text-yellow-400 fill-current animate-pulse' style={{ animationDuration: '3s' }} />
            <span className='font-medium'>{currentMovie.vote_average?.toFixed(1) || '8.5'}</span>
          </div>
        </div>

        {/* Mô tả phim */}
        <p className={`text-white/95 text-base md:text-lg leading-relaxed mb-8 max-w-2xl transition-all duration-1000 delay-1000 hover:text-white line-clamp-3 ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
          {currentMovie.overview || 'Nội dung phim đang được cập nhật.'}
        </p>

        {/* Cụm nút Action */}
        <div className={`flex flex-col sm:flex-row gap-4 transition-all duration-1000 delay-1000 ${isLoaded ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-10 scale-95 opacity-0'}`}>
          <button onClick={() => navigate(`/movies/${currentMovie._id}`)} className='group flex items-center gap-3 px-8 py-4 bg-linear-to-r from-primary to-primary-dull hover:from-primary-dull hover:to-primary text-white font-semibold rounded-full shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 border border-primary/30 hover:border-primary/60 relative overflow-hidden'>
            <Film className='w-5 h-5 group-hover:scale-125 group-hover:rotate-12 transition-transform duration-300' />
            <span className='relative z-10'>Book Now</span>
            <div className='absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700'></div>
          </button>
          <button onClick={() => navigate(`/movies/${currentMovie._id}`)} className='group flex items-center gap-3 px-8 py-4 bg-white/15 hover:bg-white/25 text-white font-semibold rounded-full border border-white/40 hover:border-primary/40 backdrop-blur-sm hover:scale-105 transition-all duration-300 relative overflow-hidden'>
            <PlayIcon className='w-5 h-5 group-hover:scale-125 transition-transform duration-500' />
            <span>Watch Trailer</span>
            <div className='absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700'></div>
          </button>
        </div>

        {/* Các dấu chấm điều hướng */}
        <div className='flex items-center gap-3 mt-8'>
          {heroMovies.map((movie, index) => (
            <button
              key={movie._id || index}
              onClick={() => { setCurrentMovieIndex(index); setTitleAnimationKey(prev => prev + 1); }}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${index === currentMovieIndex ? 'bg-primary scale-125 shadow-lg shadow-primary/50' : 'bg-white/30 hover:bg-white/50 hover:scale-110'}`}
              title={movie.title}
            />
          ))}
        </div>
      </div>

      {/* Hiệu ứng tia sáng & Khung viền bay */}
      <div className='absolute bottom-10 right-10 w-20 h-20 border-2 border-primary/30 rounded-full animate-spin-slow pointer-events-none'></div>
      <div className='absolute top-32 right-40 w-16 h-16 border border-white/20 rounded-full animate-bounce pointer-events-none' style={{ animationDuration: '4s' }}></div>
      <div className='absolute bottom-20 left-1/4 w-12 h-12 border border-primary/20 rounded-full animate-ping pointer-events-none' style={{ animationDuration: '5s' }}></div>
      <div className='absolute top-1/4 left-10 w-8 h-8 border border-white/10 rounded-full animate-pulse pointer-events-none' style={{ animationDuration: '8s' }}></div>
      
      <div className='absolute top-0 left-0 w-full h-2 bg-linear-to-r from-transparent via-primary/20 to-transparent animate-pulse pointer-events-none' style={{ animationDuration: '5s' }}></div>
      <div className='absolute bottom-0 right-0 w-2 h-full bg-linear-to-b from-transparent via-primary/20 to-transparent animate-pulse pointer-events-none' style={{ animationDuration: '6s' }}></div>
    </div>
  )
}

export default HeroSection