import React, { useState, useEffect } from 'react'
import BlurCircle from './BlurCircle'
import { ChevronLeftIcon, ChevronRightIcon, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

const DateSelect = ({ id, availableDates, isMockData = false }) => {
    const navigate = useNavigate();
    const [selected, setSelected] = useState(null);

    // Group dates by day for the UI
    const dates = Object.keys(availableDates || {}).sort();

    const onBookHandler = () => {
        if (!id || id === 'undefined') {
            return toast.error('Error: Movie ID not found. Please go back to the home page.');
        }
        if (!selected) {
            return toast.error('Please select a date');
        }
        // Pass mock flag via URL state so SeatLayout knows
        navigate(`/movies/${id}/${selected}`, {
            state: { isMockData }
        });
        window.scrollTo(0, 0);
    }

    // Auto-select first date if available
    useEffect(() => {
        if (dates.length > 0 && !selected) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelected(dates[0]);
        }
    }, [dates, selected]);

    return (
        <div id='dateSelect' className='pt-30'>
            <div className='flex flex-col md:flex-row items-center justify-between gap-10 relative p-8 bg-primary/10 border
             border-primary/20 rounded-lg'>
                <BlurCircle top='-100px' left='-100px' />
                <BlurCircle top='100px' right='0' />

                <div>
                    <div className="flex items-center gap-3 mb-5">
                        <p className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white'>
                            Choose Date
                        </p>
                        {isMockData && (
                            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 
                                rounded-full text-amber-400 text-xs font-semibold whitespace-nowrap">
                                <Sparkles className="w-3.5 h-3.5" />
                                Demo Showtimes
                            </span>
                        )}
                    </div>
                    <div className='flex items-center gap-6 text-sm mt-5'>
                        <ChevronLeftIcon width={28} className="cursor-pointer hover:text-primary transition-colors" />

                        <span className='grid grid-cols-3 md:flex flex-wrap md:max-w-lg gap-4'>
                            {dates.length > 0 ? dates.map((dateStr, index) => {
                                const date = new Date(dateStr + 'T00:00:00');
                                return (
                                    <button
                                        onClick={() => setSelected(dateStr)}
                                        key={index}
                                        className={`flex flex-col items-center justify-center h-18 w-14 aspect-square rounded cursor-pointer border 
                                            transition-all ${
                                            selected === dateStr 
                                            ? "bg-primary text-white border-primary hover:scale-105 active:scale-95 shadow-xl shadow-primary/60" 
                                            : "bg-white/5 border-transparent hover:bg-primary/20 hover:border-primary text-white hover:scale-105 active:scale-95"
                                        }`}
                                    >
                                        <span className='text-xs opacity-70'>{date.toLocaleDateString('en-US', { weekday: "short" })}</span>
                                        <span className='text-lg font-bold'>{date.getDate()}</span>
                                        <span className='text-xs opacity-70'>{date.toLocaleDateString('en-US', { month: "short" })}</span>
                                    </button>
                                );
                            }) : (
                                <p className='text-gray-400'>No showtimes available for this movie.</p>
                            )}
                        </span>

                        <ChevronRightIcon width={28} className="cursor-pointer hover:text-primary transition-colors" />
                    </div>
                </div>

                <button onClick={() => {onBookHandler(); window.scrollTo({top: 0,behavior:'smooth'})}} className="group flex items-center gap-3 px-10 py-6 bg-gradient-to-r from-[#F84565]
                 to-[#D63854] hover:from-[#D63854] hover:to-[#F84565] text-white font-semibold rounded-full shadow-lg shadow-[#F84565]/30 
                 hover:shadow-xl hover:shadow-[#F84565]/60 hover:scale-105 active:scale-95 transition-all duration-300 border border-[#F84565]/30
                  hover:border-[#F84565]/60 relative overflow-hidden">
                    Book Now
                </button>
            </div>
        </div>
    )
}

export default DateSelect;