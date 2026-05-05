import React from 'react'
import { useNavigate } from 'react-router-dom';

const Loading = () => {
    const navigate = useNavigate();
    return (
        <div className='flex flex-col justify-center px-6 md:px-6 lg:px-40 pt-30 md:pt-50'>
            <div className='flex flex-col justify-center items-center'>
                <div className='animate-spin rounded-full h-14 w-14 border-2 border-t-primary mt-40'></div>
                <div className='text-xl md:text-xl lg:text-xl font-semibold text-white mt-5 mb-55 justify-center text-center'>Loading movies...</div>


            </div>
            <button onClick={() => { navigate('/'); scrollTo(0, 0) }}
                className="group flex justify-center items-center gap-3 px-12 py-6 m-auto bg-linear-to-r from-primary to-primary-dull
                 hover:from-primary-dull hover:to-primary text-white font-semibold rounded-full shadow-lg shadow-primary/30 
                 hover:shadow-xs hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 border
                  border-primary/30 hover:border-primary/60 relative overflow-hidden mb-10">Return Home
            </button>
        </div>
    )
}

export default Loading