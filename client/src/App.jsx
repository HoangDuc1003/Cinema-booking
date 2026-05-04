import React, { Suspense, lazy } from 'react'
import Navbar from './components/Navbar'
import { Route, Routes, useLocation } from 'react-router-dom'
// feat: Lazy-load page routes to reduce initial bundle
const Home = lazy(() => import('./pages/Home'));
const Movies = lazy(() => import('./pages/Movies'));
const MovieDetails = lazy(() => import('./pages/MovieDetails'));
const SeatLayout = lazy(() => import('./pages/SeatLayout'));
const Favorite = lazy(() => import('./pages/Farvorite'));
const MyBookings = lazy(() => import('./pages/MyBookings'));
const MyMovies = lazy(() => import('./pages/MyMovies'));
import { Toaster } from 'react-hot-toast'
import Footer from './components/Footer'

// feat: Main application component with routing
const App = () => {
  // chore: Check if current route is admin route to hide navbar/footer
  const isAdminRoute = useLocation().pathname.startsWith('/admin')

  return (
    <>
      {/* chore: Main app layout with toast notifications */}
      <Toaster />
      {/* feat: Navigation bar (hidden on admin routes) */}
      {!isAdminRoute && <Navbar />}
      {/* feat: Application routing configuration (lazy-loaded) */}
      <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-white">Loading...</div>}>
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/movies' element={<Movies />} />
          <Route path='/movies/:id' element={<MovieDetails />} />
          <Route path='/movies/:id/date' element={<SeatLayout />} />
          <Route path='/my-bookings' element={<MyBookings />} />
          <Route path='/favorite' element={<Favorite />} />
          <Route path='/my-movies' element={<MyMovies />} />
        </Routes>
      </Suspense>
      {/* feat: Footer component (hidden on admin routes) */}
      {!isAdminRoute && <Footer />}
    </>
  )
}

export default App