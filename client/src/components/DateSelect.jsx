import React, { useState, useEffect, useMemo, useRef } from 'react'
import BlurCircle from './BlurCircle'
import { ChevronLeftIcon, ChevronRightIcon, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

const DateSelect = ({
    id,
    availableDates,
    status = 'loading',
    error = '',
    onRetry,
}) => {
    const navigate = useNavigate();
    const [selected, setSelected] = useState(null);
    const datesRef = useRef(null);

    const dates = useMemo(() => Object.keys(availableDates || {}).sort(), [availableDates]);

    const onBookHandler = () => {
        if (!id || id === 'undefined') {
            return toast.error('Error: Movie ID not found. Please go back to the home page.');
        }
        if (status !== 'ready' || !selected) {
            return toast.error('Please select a date');
        }
        navigate(`/movies/${id}/${selected}`);
        window.scrollTo(0, 0);
    }

    useEffect(() => {
        if (dates.length > 0 && !dates.includes(selected)) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelected(dates[0]);
        } else if (dates.length === 0 && selected) {
            setSelected(null);
        }
    }, [dates, selected]);

    const scrollDates = (direction) => {
        datesRef.current?.scrollBy({
            left: direction * Math.max(180, datesRef.current.clientWidth * 0.75),
            behavior: 'smooth',
        });
    };

    const bookDisabled = status !== 'ready' || !selected;

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
                    </div>
                    <div className='flex items-center gap-3 sm:gap-6 text-sm mt-5' aria-live="polite">
                        <button
                            type="button"
                            onClick={() => scrollDates(-1)}
                            disabled={dates.length < 2}
                            aria-label="Previous show dates"
                            className="shrink-0 rounded-full p-2 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeftIcon width={28} aria-hidden="true" />
                        </button>

                        <div ref={datesRef} className='flex max-w-[18rem] sm:max-w-lg gap-4 overflow-x-auto no-Scrollbar scroll-smooth'>
                            {status === 'loading' && Array.from({ length: 3 }, (_, index) => (
                                <span key={index} className="h-18 w-14 shrink-0 animate-pulse rounded bg-white/8" aria-hidden="true" />
                            ))}

                            {status === 'ready' && dates.map((dateStr) => {
                                const date = new Date(dateStr + 'T00:00:00');
                                return (
                                    <button
                                        type="button"
                                        onClick={() => setSelected(dateStr)}
                                        key={dateStr}
                                        aria-pressed={selected === dateStr}
                                        aria-label={date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                        className={`flex shrink-0 flex-col items-center justify-center h-18 w-14 aspect-square rounded cursor-pointer border
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
                            })}

                            {status === 'empty' && (
                                <p className='text-gray-400'>No showtimes available for this movie.</p>
                            )}

                            {status === 'error' && (
                                <div role="alert" className="flex flex-col items-start gap-2 text-gray-300">
                                    <p>{error || 'Unable to load showtimes.'}</p>
                                    <button
                                        type="button"
                                        onClick={onRetry}
                                        className="inline-flex items-center gap-2 text-primary hover:text-white focus-visible:ring-2 focus-visible:ring-primary rounded"
                                    >
                                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                                        Try again
                                    </button>
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => scrollDates(1)}
                            disabled={dates.length < 2}
                            aria-label="Next show dates"
                            className="shrink-0 rounded-full p-2 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRightIcon width={28} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <button
                  type="button"
                  disabled={bookDisabled}
                  onClick={onBookHandler}
                  className="group flex items-center gap-3 px-10 py-6 bg-gradient-to-r from-[#F84565]
                 to-[#D63854] hover:from-[#D63854] hover:to-[#F84565] text-white font-semibold rounded-full shadow-lg shadow-[#F84565]/30 
                 hover:shadow-xl hover:shadow-[#F84565]/60 hover:scale-105 active:scale-95 transition-all duration-300 border border-[#F84565]/30
                  hover:border-[#F84565]/60 relative overflow-hidden disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100 disabled:shadow-none">
                    Book Now
                </button>
            </div>
        </div>
    )
}

export default DateSelect;
