import React, { useEffect, useState, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { assets } from '../assets/assets'
import { SearchIcon, MenuIcon, XIcon, TicketPlus } from 'lucide-react'
import { useClerk, UserButton, useUser } from '@clerk/react'
import useBodyScrollLock from '../hooks/useBodyScrollLock'

const navLinks = [
  { name: 'Home', path: '/' },
  { name: 'Movies', path: '/movies' },
  { name: 'Theater', path: '/theater' },
  { name: 'Releases', path: '/releases' },
  { name: 'Favorites', path: '/favorite' },
];

const Navbar = () => {

  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const { user } = useUser();
  const { openSignIn } = useClerk();
  const navigate = useNavigate();
  const location = useLocation();
  const tickingRef = useRef(false);
  const menuButtonRef = useRef(null);
  const closeButtonRef = useRef(null);

  const closeMenu = ({ restoreFocus = false } = {}) => {
    setIsOpen(false);
    if (restoreFocus) menuButtonRef.current?.focus();
  };

  // Escape closes the phone menu, as it would any overlay.
  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen]);

  // While the full-screen menu is up, the page behind it must not scroll under
  // the finger; focus moves into the menu so keyboard and screen reader users
  // land where the content is.
  useBodyScrollLock(isOpen);
  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  // The open phone menu covers the page, so Tab cycles inside it instead of
  // wandering onto the controls hidden behind the overlay.
  const keepFocusInMenu = (event) => {
    if (!isOpen || event.key !== 'Tab') return;
    const items = [...event.currentTarget.querySelectorAll('a[href], button:not([disabled])')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Rotating a tablet or widening a window past the phone layout leaves no menu
  // to close, so drop the open state instead of keeping the page locked.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const handleChange = (event) => { if (event.matches) setIsOpen(false); };
    desktop.addEventListener?.('change', handleChange);
    return () => desktop.removeEventListener?.('change', handleChange);
  }, []);

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

  // Only colours and padding change on scroll; phones get a near-opaque bar
  // instead of a backdrop blur, which would be re-filtered on every scrolled frame.
  return (
    // Tablet widths (768-1279px) get tighter spacing, a smaller logo and
    // smaller link text: at the desktop sizes the five links overflowed the
    // pill and "Favorites" was clipped under the search icon.
    <div className={`app-navbar fixed top-0 left-0 z-50 w-full flex items-center justify-between px-6 md:px-8 lg:px-12 xl:px-36
      transition-[background-color,border-color,box-shadow,padding] duration-300 border-b ${
      isScrolled
        ? 'py-3 bg-black/85 md:bg-black/60 md:backdrop-blur-md border-white/10 shadow-lg'
        : 'py-5 bg-black/0 border-transparent'
    }`}>

      {/* Padding offset by negative margin: a 44px tap area around the 34px
          logo without making the bar any taller. */}
      <Link to='/' className='group block -my-[5px] py-[5px] transition-transform duration-300 hover:scale-105' >
        <img src={assets.logo} alt="NitroCine" className='w-36 lg:w-40 xl:w-50 h-auto' />
        </Link>

        {/* The closed phone menu is slid off screen; `invisible` also takes its
            links out of the tab order and the accessibility tree until it opens.
            It moves with transform and opacity only, so opening it never
            re-lays out the page. */}
        <nav
          id="app-mobile-nav"
          aria-label="Main"
          onKeyDown={keepFocusInMenu}
          className={`max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:w-full max-md:font-medium
        max-md:text-lg z-50 flex flex-col md:flex-row items-center max-md:justify-center gap-3 md:gap-4 lg:gap-8 md:px-5 lg:px-8 py-1.75 md:shrink-0
        app-mobile-nav md:rounded-full bg-black md:bg-white/10 md:backdrop-blur-xl
        md:border border-gray-300/20 md:shadow-xl overflow-hidden
        max-md:duration-300 max-md:ease-out motion-reduce:transition-none ${isOpen?
        // Opening shows the menu at once (so focus can land in it); closing
        // keeps it visible until the slide-out has finished.
        'max-md:transition-[translate,opacity] max-md:visible max-md:translate-x-0 max-md:opacity-100'
        :'max-md:transition-[translate,opacity,visibility] max-md:invisible max-md:-translate-x-full max-md:opacity-0'}`}>

          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close menu"
            className="app-mobile-nav__close md:hidden absolute top-6 right-6 grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-300 group tap-press"
            onClick={() => closeMenu({ restoreFocus: true })}
          >
             <XIcon aria-hidden="true" className='w-6 h-6 cursor-pointer text-white group-hover:rotate-90 transition-transform duration-300' />
          </button>

          {navLinks.map((link, index) => {
            // A movie page still belongs to Movies.
            const isActive = location.pathname === link.path
              || (link.path !== '/' && location.pathname.startsWith(`${link.path}/`));
            return (
              <Link
                key={link.name}
                // From the phone menu, focus returns to the menu button rather
                // than staying on a link that is about to be hidden.
                onClick={() => { window.scrollTo(0, 0); if (isOpen) closeMenu({ restoreFocus: true }); }}
                to={link.path}
                aria-current={isActive ? 'page' : undefined}
                // Phone links rise in one after another as the menu opens.
                style={isOpen ? { transitionDelay: `${90 + index * 45}ms` } : undefined}
                className={`relative font-medium md:text-sm lg:text-base transition-[color,scale,translate,opacity] duration-300 group px-1 py-1
                  max-md:flex max-md:min-h-12 max-md:items-center max-md:px-6 max-md:text-2xl motion-reduce:transition-none ${
                  isOpen ? 'max-md:translate-y-0 max-md:opacity-100' : 'max-md:translate-y-3 max-md:opacity-0'
                } ${
                  isActive ? 'text-primary md:scale-110 font-semibold' : 'text-white/80 hover:text-primary md:hover:scale-110'
                }`}
              >
                <span className="relative z-10">{link.name}</span>

                <span className={`absolute -bottom-1 max-md:bottom-1 left-0 max-md:left-6 max-md:right-6 h-0.5 bg-primary transition-[width] duration-500 ${
                  isActive ? 'w-full max-md:w-auto' : 'w-0 md:group-hover:w-full'
                }`}></span>

                <span className="absolute inset-0 rounded-lg bg-primary/10 scale-0 group-hover:scale-100 transition-transform
                 duration-500 -z-10 max-md:hidden"></span>
              </Link>
            );
          })}
        </nav>

        <div className='flex items-center gap-4 md:gap-5 lg:gap-8 max-md:ml-auto'>
          <button
            type="button"
            aria-label="Search movies"
            onClick={() => { navigate('/movies'); window.scrollTo(0, 0); }}
            className='max-md:hidden cursor-pointer hover:text-primary transition-colors'
          >
            <SearchIcon aria-hidden="true" className='w-6 h-6' />
          </button>
          {
            !user ? (
                  // Wrapped: handing the click event to openSignIn passes it in as sign-in options.
                  <button type="button" onClick={() => openSignIn()} className='min-h-11 -my-0.5 px-5 text-sm sm:text-base sm:min-h-0 sm:my-0 sm:px-7 sm:py-2
                   bg-primary-dull hover:bg-[#c22d48] transition-[background-color,scale] duration-300 hover:scale-105 rounded-full
                  font-medium cursor-pointer tap-press'>Login</button>
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

        <button
          ref={menuButtonRef}
          type="button"
          aria-label="Open menu"
          aria-expanded={isOpen}
          aria-controls="app-mobile-nav"
          onClick={() => setIsOpen(!isOpen)}
          className='max-md:ml-2 -mr-2 grid h-11 w-11 place-items-center rounded-full md:hidden cursor-pointer hover:text-primary transition-colors tap-press'
        >
          <MenuIcon aria-hidden="true" className='w-8 h-8' />
        </button>
    </div>
  )
}

export default Navbar
