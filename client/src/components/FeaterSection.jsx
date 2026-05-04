import { ArrowRightIcon, ShowerHead } from 'lucide-react'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import BlurCircle from './BlurCircle'
import { dummyShowsData } from '../assets/assets'
import MovieCard from './MovieCard'


const FeaterSection = () => {
    
    const navigate = useNavigate();

  return (
    <div className='px-6 md:px-16 lg:px-24 xl:px-40 overflow-hidden'>

        <div className='relative flex items-center justify-between pt-20 pb-10'>
            <BlurCircle top='50px' right='-60px'/>
            <BlurCircle top='50px' left='-65px'/>
            <p className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 mt-20'>Now Showing</p>
            <button onClick={()=>{navigate('/movies');scrollTo(0,0)}} className="group flex items-center gap-2 px-6 py-3 text-sm text-gray-300 
            hover:text-white bg-white/5 hover:bg-white/10 border border-white/20 hover:border-primary/40 
            rounded-full backdrop-blur-sm transition-all duration-300 hover:scale-105 relative overflow-hidden mt-20">
                View All
                <ArrowRightIcon className='group-hover:translate-x-0.5 transition w-4.5 h-4.5'/>
            </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6 w-full">
            {dummyShowsData.slice(0,8).map((show)=>(
                <MovieCard key={show._id} movie={show}/>
            ))}
        </div>

        <div className='flex justify-center mt-20'>
            <button onClick={()=>{navigate('/movies');scrollTo(0,0)}} className='px-10 py-3 text-sm bg-primary hover:bg-primary-dull
            transition rounded-md font-medium cursor-pointer'>Show more</button>
        </div>

    </div>
  )
}

export default FeaterSection