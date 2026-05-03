import React, { useState } from 'react'
import { dummyTrailers } from '../assets/assets';

const TrailerSection = () => {
    const [currentTrailer, setCurrentTrailer] = useState(dummyTrailers[0]);
  return (
    <div className='px-6 md:px-16 lg:px-24 py-20 overflow-hidden'>
        <p className='text-gray-300 font-medium text-lg max-w-240 mx auto'>Trailers</p>
        <div>
          
        </div>
    </div>
  )
}

export default TrailerSection