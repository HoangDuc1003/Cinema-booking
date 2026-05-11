import React from 'react'
import { useNavigate } from 'react-router-dom';

const Loading = () => {
    const navigate = useNavigate();
    return (
        <div className='flex flex-col justify-center px-6 md:px-6 lg:px-40 mt-25'>
            <div className='flex flex-col justify-center items-center'>
                <div className='animate-spin rounded-full h-14 w-14 border-2 border-t-primary mt-40'></div>
                <div className='text-xl md:text-xl lg:text-xl font-semibold text-white mt-5 mb-55 justify-center text-center'>Loading movies...</div>


            </div>
        </div>
    )
}

export default Loading