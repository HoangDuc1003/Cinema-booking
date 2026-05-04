import React,{useState} from 'react'
import { useParams } from 'react-router-dom'
import { fetchPopularMovies } from '../services/tmdb'

const MovieDetails = () => {
  const {id} = useParams();
  const [show,setshow] = useState(null);

  const getShow = async () =>{
    const show = fetchPopularMovies.find(show => show.id === id)
    
  }
  return (
    <div>
    
    </div>
  )
}

export default MovieDetails