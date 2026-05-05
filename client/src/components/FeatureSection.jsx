import { ArrowRightIcon, ShowerHead } from 'lucide-react'
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import BlurCircle from './BlurCircle'
import { fetchPopularMovies } from '../services/tmdb'
import MovieCard from './MovieCard'
import Loading from './Loading'

// Feature: shows featured movies
const FeatureSection = () => {
    const navigate = useNavigate();
    const styleRef = useRef(false);

    // Store movies data
    const [movies, setMovies] = useState([]);

    // Track loading status
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    // Fetch data on mount
    useEffect(() => {
        const loadMovies = async () => {
            setIsLoading(true);
            try {
                setHasError(false);
                const data = await fetchPopularMovies();
                setMovies((Array.isArray(data) ? data.slice(0, 10) : []));
            } catch (e) {
                console.error('FeatureSection load error', e);
                setMovies([]);
                setHasError(true);
            } finally {
                setIsLoading(false);
            }
        };

        loadMovies();
    }, []);

    useEffect(() => {
        if (styleRef.current) return;
        styleRef.current = true;
        const s = document.createElement('style');
        s.textContent = `
          .show-more-btn { background: linear-gradient(to-r, rgb(229,9,20), rgb(184,7,16)); color: #fff; border: none; position: relative; overflow: hidden; }
          .show-more-btn::after { content: ''; position: absolute; left: -60%; top: -40%; width: 220%; height: 180%; background: linear-gradient(90deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06), rgba(255,255,255,0.14)); transform: rotate(25deg) translateX(-100%); transition: transform 520ms ease; pointer-events: none; opacity: 0.95; mix-blend-mode: screen; }
          .show-more-btn:hover::after { transform: rotate(25deg) translateX(0%); }
          .show-more-btn:hover { box-shadow: 0 10px 30px rgba(229,9,20,0.55), 0 0 0 2px rgba(229,9,20,0.12); transform: translateY(-3px); }
        `;
        document.head.appendChild(s);
    }, []);

    return (
        <div className='px-6 md:px-16 lg:px-24 xl:px-40 overflow-hidden'>
            <div className='relative flex items-center justify-between pt-20 pb-10'>
                <BlurCircle top='80px' right='-60px' />
                <BlurCircle top='600px' left='-65px' />
                <BlurCircle top='800px' right='-100px' />
                <BlurCircle top='0px' left='0' />
                <p className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 mt-20'>Now Showing</p>
                <button onClick={() => { navigate('/movies'); scrollTo(0, 0) }} className="group flex items-center gap-2 px-6 py-3 text-sm text-gray-300 
                hover:text-white bg-white/5 hover:bg-white/10 border border-white/20 hover:border-primary/40 
                rounded-full backdrop-blur-sm transition-all duration-300 hover:scale-105 relative overflow-hidden mt-20">
                    View All
                    <ArrowRightIcon className='group-hover:translate-x-0.5 transition w-4.5 h-4.5' />
                </button>
            </div>

            {isLoading || hasError ? (
                <Loading />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6 w-full">
                    {/* Movies grid */}
                    {movies.map((show) => (
                        <MovieCard key={show._id} movie={show} />
                    ))}
                </div>
            )}

            <div className='flex justify-center mt-20'>
                <button onClick={() => { navigate('/movies'); scrollTo(0, 0) }}
                    className="group flex items-center gap-3 px-12 py-6 bg-linear-to-r from-primary to-primary-dull
                 hover:from-primary-dull hover:to-primary text-white font-semibold rounded-full shadow-lg shadow-primary/30 
                 hover:shadow-xs hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 border
                  border-primary/30 hover:border-primary/60 relative overflow-hidden mb-5">Show more</button>
            </div>
        </div>
    )
}

export default FeatureSection