import React from 'react'
import { assets } from '../assets/assets'
import { ArrowRight, CalendarIcon, ClockIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const HeroSection = () => {
    const navigate = useNavigate();

    return (
        
        <div className='relative flex flex-col items-start justify-center px-6 md:px-16 lg:px-36 h-screen w-full overflow-hidden bg-black text-white'>
            
            <div className='absolute inset-0 z-0 w-full h-full'>
                 <div className='w-full h-full bg-[url("/backgroundImage.png")] bg-center bg-cover opacity-60'></div>
            </div>

            <div 
                className='absolute top-1/4 -left-1/4 w-125 h-125 bg-cyan-500/70 rounded-full blur-[120px] animate-pulse z-0 pointer-events-none' 
                style={{ animationDuration: '3s' }}
            ></div>

            <div 
                className='absolute bottom-1/4 -right-1/4 w-150 h-150 bg-pink-600/60 rounded-full blur-[120px] animate-pulse z-0 pointer-events-none' 
                style={{ animationDuration: '4s' }}
            ></div>

            <div className='absolute inset-0 z-0 bg-linear-to-r from-black/90 via-black/40 to-transparent pointer-events-none'></div>

            <div className='relative z-10 flex flex-col items-start gap-4'>
                <img src={assets.marvelLogo} alt="marvelLogo" className='max-h-11 lg:h-11 mt-20'/>

                <h1 className='text-5xl md:text-7xl md:leading-tight font-semibold max-w-2xl drop-shadow-2xl'>
                    Guardians <br/> of the Galaxy
                </h1>

                <div className='flex items-center gap-4 text-gray-300 font-medium'>
                    <span>Action | Adventure | Sci-Fi</span>
                    <div className='flex items-center gap-1'>
                        <CalendarIcon className='w-4 h-4'/> 2018         
                    </div>
                    <div className='flex items-center gap-1'>
                        <ClockIcon className='w-4 h-4'/> 2h 8m
                    </div>
                </div>
                
                <p className='max-w-md text-gray-300 text-lg drop-shadow-md'>
                    In a post-apocalyptic world where cities ride on wheels 
                    and consume each other to survive, 
                    two people meet in London and try to stop a conspiracy.
                </p>
                
                <button onClick={()=>navigate('/movies')} className='mt-4 flex items-center gap-2 px-8 py-3 text-sm bg-primary hover:bg-primary-dull transition-all duration-300 rounded-full font-medium cursor-pointer hover:scale-105 shadow-2xl shadow-red-600/50'>
                    Explore Movie
                    <ArrowRight className='w-5 h-5'/>
                </button>
            </div>
        </div>
    )
}

export default HeroSection