import React, { useEffect, useState, useRef } from 'react' 
import { Link, useNavigate, useLocation } from 'react-router-dom' 
import { assets } from '../assets/assets'
import { SearchIcon, MenuIcon, XIcon, TicketPlus } from 'lucide-react'
import { useClerk, UserButton, useUser } from '@clerk/react'

const Navbar = () => {

  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false); 

  const { user } = useUser();
  const { openSignIn } = useClerk();
  const navigate = useNavigate();
  const location = useLocation(); 
  const tickingRef = useRef(false);

  
  
  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Movies', path: '/movies' },
    { name: 'Theater', path: '/theater' },
    { name: 'Releases', path: '/releases' },
    { name: 'Favorites', path: '/favorite' },
  ];

  // Change navbar style on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        setIsScrolled(window.scrollY > 100);
        tickingRef.current = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className={`fixed top-0 left-0 z-50 w-full flex items-center justify-between px-6 md:px-16 lg:px-36 transition-all 
      duration-300 border-b ${
      isScrolled 
        ? 'py-3 bg-black/60 backdrop-blur-md border-white/10 shadow-lg' 
        : 'py-5 bg-black/0 backdrop-blur-none border-transparent'
    }`}>
      
      <Link to='/' className='group transition-transform duration-300 hover:scale-105' >
        <img src={assets.logo} alt="logo" className='w-36 md:w-50 h-auto' />
        </Link>
        
        <div className={`max-md:absolute max-md:top-0 max-md:left-0 max-md:font-medium 
        max-md:text-lg z-50 flex flex-col md:flex-row items-center max-md:justify-center gap-8 md:px-8 py-3 mx-4 
        max-md:h-screen md:rounded-full backdrop-blur-xl bg-black/80 md:bg-white/10 
        md:border border-gray-300/20 md:shadow-xl overflow-hidden transition-all duration-500 ease-out ${isOpen?
        'max-md:w-full max-md:translate-x-0 max-md:opacity-100':'max-md:w-0 max-md:-translate-x-full max-md:opacity-0'}`}>
          
          <button className="md:hidden absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all 
          duration-300 group" onClick={()=>setIsOpen(false)}>
             <XIcon className='w-6 h-6 cursor-pointer text-white group-hover:rotate-90 transition-transform duration-300' />
          </button>

          {navLinks.map((link) => {
            const isActive = location.pathname === link.path; 
            return (
              <Link 
                key={link.name}
                onClick={() => { window.scrollTo(0, 0); setIsOpen(false); }} 
                to={link.path} 
                className={`relative font-medium transition-all duration-500 group px-1 py-1 ${
                  isActive ? 'text-primary scale-110 font-semibold' : 'text-white/80 hover:text-primary hover:scale-110'
                }`}
              >
                <span className="relative z-10">{link.name}</span>
                
                <span className={`absolute -bottom-1 left-0 h-0.5 bg-primary transition-all duration-500 ${
                  isActive ? 'w-full' : 'w-0 group-hover:w-full'
                }`}></span>

                <span className="absolute inset-0 rounded-lg bg-primary/10 scale-0 group-hover:scale-100 transition-transform
                 duration-500 -z-10"></span>
              </Link>
            );
          })}
        </div>

        <div className='flex items-center gap-8'>
          <SearchIcon onClick={()=>{navigate('/movies'),scrollTo(0,0)}} className='max-md:hidden w-6 h-6 cursor-pointer hover:text-primary transition-colors'/>
          {
            !user ? (
                  <button onClick={openSignIn} className='px-4 py-1 sm:px-7 sm:py-2
                   bg-primary hover:bg-primary-dull transition-all duration-300 hover:scale-105 rounded-full 
                  font-medium cursor-pointer'>Login</button>
            ):(
              <UserButton>
                <UserButton.MenuItems>
                  <UserButton.Action label='My Bookings' labelIcon=
                  {<TicketPlus width={15}/>} onClick={()=>navigate('/my-bookings')}/>
                </UserButton.MenuItems>
              </UserButton>
            )
          }
        </div>

        <MenuIcon className = 'max-md:ml-4 md:hidden w-8 h-8 cursor-pointer hover:text-primary transition-colors'
        onClick={()=>setIsOpen(!isOpen)}/>
    </div>
  )
}

export default Navbar