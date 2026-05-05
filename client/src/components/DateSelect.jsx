import React, { useState, useEffect } from 'react'
import BlurCircle from './BlurCircle'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

const DateSelect = ({ id }) => {

    const navigate = useNavigate();
    const [mockDates, setMockDates] = useState([]);
    const [selected, setSelected] = useState(null);

    const onBookHandler = () =>{
        if(!selected){
            return toast.error('Please select a date');
        }
        else {
            navigate(`/movies/${id}/${selected}`);
            window.scrollTo(0,0);
        }
    }

    useEffect(() => {
        const today = new Date();
        const next10Days = [];

        for (let i = 0; i < 10; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            next10Days.push(d);
        }

        const random7Days = next10Days
            .sort(() => 0.5 - Math.random())
            .slice(0, 7)
            .sort((a, b) => a - b);
            
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMockDates(random7Days);
    }, []);

    return (
        <div id='dateSelect' className='pt-30'>
            <div className='flex flex-col md:flex-row items-center justify-between gap-10 relative p-8 bg-primary/10 border
             border-primary/20 rounded-lg'>
                <BlurCircle top='-100px' left='-100px' />
                <BlurCircle top='100px' right='0' />

                <div>
                    <p className='relative text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-5'>
                        Choose Date
                    </p>
                    <div className='flex items-center gap-6 text-sm mt-5'>
                        <ChevronLeftIcon width={28} className="cursor-pointer hover:text-primary transition-colors" />

                        <span className='grid grid-cols-3 md:flex flex-wrap md:max-w-lg gap-4'>
                            {mockDates.map((date, index) => (
                                <button
                                    onClick={() => setSelected(date)}
                                    key={index}
                                    className={`flex flex-col items-center justify-center h-18 w-14 aspect-square rounded cursor-pointer border 
                                        transition-all ${
                                        selected === date 
                                        ? "bg-primary text-white border-primary  hover:from-primary-dull hover:to-primary hover:shadow-xl hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 border" 
                                        : "bg-white/5 border-transparent hover:bg-primary/20 hover:border-primary text-white hover:from-primary-dull hover:to-primary hover:shadow-xl hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 border"
                                    }`}
                                >
                                    <span className='text-xs opacity-70'>{date.toLocaleDateString('en-US', { weekday: "short" })}</span>
                                    <span className='text-lg font-bold'>{date.getDate()}</span>
                                    <span className='text-xs opacity-70'>{date.toLocaleDateString('en-US', { month: "short" })}</span>
                                </button>
                            ))}
                        </span>

                        <ChevronRightIcon width={28} className="cursor-pointer hover:text-primary transition-colors" />
                    </div>
                </div>

                <button onClick={onBookHandler} className="group flex items-center gap-3 px-10 py-6 bg-linear-to-r from-primary
                 to-primary-dull hover:from-primary-dull hover:to-primary text-white font-semibold rounded-full shadow-lg shadow-primary/30 
                 hover:shadow-xl hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 border border-primary/30
                  hover:border-primary/60 relative overflow-hidden">
                    Book Now
                </button>
            </div>
        </div>
    )
}

export default DateSelect;