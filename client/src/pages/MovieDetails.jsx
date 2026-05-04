import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchPopularMovies } from '../services/tmdb'

// feat: Component for displaying detailed movie information
const MovieDetails = () => {
  // chore: Extract movie ID from URL parameters
  const { id } = useParams();
  // chore: State for storing selected movie details
  const [show, setShow] = useState(null);

  // feat: Fetch movie details based on ID
  const getShow = async () => {
    // fix: Should use async/await pattern for API calls
    const show = fetchPopularMovies.find(show => show.id === id)
  }
  
  return (
    <div>
      {/* TODO: Add movie details UI */}
    </div>
  )
}

export default MovieDetails