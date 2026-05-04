import React, { useState } from 'react'
import { dummyTrailers } from '../assets/assets';
import ReactPlayer from 'react-player'
import BlurCircle from '../components/BlurCircle'
import { PlayCircleIcon } from 'lucide-react';

// feat: Component for displaying movie trailers section
const TrailerSection = () => {
  // chore: State management for current selected trailer
  const [currentTrailer, setCurrentTrailer] = useState(dummyTrailers[3]);

  return (
    <div className='px-6 md:px-16 lg:px-24 py-20 overflow-hidden'>
        {/* feat: Section title */}
        <p className='relative text-3xl md:text-4xl lg:text-5xl font-bold
         text-white mb-2'>Trailers</p>
        
        {/* chore: Main video player container with decorative elements */}
        <div className='relative mt-6'>
          {/* chore: Decorative blur circles */}
          <BlurCircle top='220px' right='-100px'/>
          <BlurCircle top='-40px' left='-20px'/>  
          {/* feat: Main trailer video player */}
          <ReactPlayer src={currentTrailer.videoUrl} controls={false}
          className="mx-auto max-w " width="900px" height="530px"/>
        </div>
        {/* feat: Trailer thumbnails gallery */}
        <div className='group grid grid-cols-4 gap-4 md:gap-8 mt-8
        max-w-3xl mx-auto'>
          {dummyTrailers.map((Trailers)=>(
            <div key={Trailers.image} className='relative group-hover:not-hover:opacity-50 hover:-translate-y-1 duration-300
            transition max-md:h-60 md:max-h-60 cursor-pointer' onClick={()=>
              setCurrentTrailer(Trailers)}>
              {/* chore: Thumbnail image with brightness adjustment */}
              <img src={Trailers.image} 
                alt="Trailer" 
                className={`rounded-lg w-full h-full object-cover 
                  ${
                    currentTrailer.image===Trailers.image 
                    ?'brightness-100'
                    :'brightness-55'
                }`}
              />

              {/* feat: Play icon overlay on thumbnail */}
              <PlayCircleIcon strokeWidth={1.6} className='absolute top-1/2 left-1/2 w-5 md:w-8 h-5 md:h-12 
              transform -translate-x-1/2 -translate-y-1/2'/>
            </div>
          ))}
        </div>
    </div>
  )
}

export default TrailerSection