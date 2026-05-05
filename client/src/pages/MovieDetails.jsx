import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchPopularMovies } from '../services/tmdb';

const MovieDetails = () => {

// Thay vì dùng useState/useEffect, hãy tính toán trực tiếp
const { id } = useParams();
const movie = fetchPopularMovies.find(show => show._id === id);

// Nếu không tìm thấy movie, return sớm để tránh lỗi null
return movie ? (
  <div className='px-6 md:px-6 lg:px-40 pt-30 md:pt-50'>

  </div>

): <div>Loading...</div>

}
export default MovieDetails