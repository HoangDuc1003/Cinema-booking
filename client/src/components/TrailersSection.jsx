import React, { useState } from 'react'
import { dummyTrailers } from '../assets/assets';
import ReactPlayer from 'react-player'
import BlurCircle from '../components/BlurCircle'
import { PlayCircleIcon } from 'lucide-react';

const TrailerSection = () => {
  const [currentTrailer, setCurrentTrailer] = useState(dummyTrailers[3]);

  return (
    <div className='px-6 md:px-16 lg:px-24 py-20 overflow-hidden'>
        <p className='relative text-3xl md:text-4xl lg:text-5xl font-bold
         text-white mb-2'>Trailers</p>
        
        <div className='relative mt-6'>
          <BlurCircle top='20px' right='-100px'/>
          <ReactPlayer src={currentTrailer.videoUrl} controls={false}
          className="mx-auto max-w " width="900px" height="530px"/>
        </div>
        <div className='group grid grid-cols-4 gap-4 md:gap-8 mt-8
        max-w-3xl mx-auto'>
          {dummyTrailers.map((Trailers)=>(
            <div key={Trailers.image} className='relative group-hover:not-hover:opacity-50 hover:-translate-y-1 duration-300
            transition max-md:h-60 md:max-h-60 cursor-pointer 'onClick={()=>
              setCurrentTrailer(Trailers)}>
               
              <img src={Trailers.image} 
                alt="Trailer" 
                className={`rounded-lg w-full h-full object-cover 
                  ${
                    currentTrailer.image===Trailers.image 
                    ?'brightness-100'
                    :'brightness-55'
                }`}
              />

              <PlayCircleIcon strokeWidth={1.6} className='absolute top-1/2 left-1/2 w-5 md:w-8 h-5 md:h-12 
              transform -translate-x-1/2 -translate-y-1/2'/>

            </div>
          ))}
        </div>
    </div>
  )
}

export default TrailerSection