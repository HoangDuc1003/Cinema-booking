import React, { Suspense, lazy } from 'react'
import Navbar from './components/Navbar'
import { Route, Routes, useLocation } from 'react-router-dom'
import { SignIn } from '@clerk/react';
// Lazy-loaded routes
const Home = lazy(() => import('./pages/Home'));
const Movies = lazy(() => import('./pages/Movies'));
const MovieDetails = lazy(() => import('./pages/MovieDetails'));
const SeatLayout = lazy(() => import('./pages/SeatLayout'));
const Favorite = lazy(() => import('./pages/Favorite'));
const MyBookings = lazy(() => import('./pages/MyBookings'));
const MyMovies = lazy(() => import('./pages/MyMovies'));
const Release = lazy(() => import('./pages/Release'));
const Theater = lazy(() => import('./pages/Theater'));

import { Toaster } from 'react-hot-toast'
import Footer from './components/Footer'
// Admin pages
import Layout from './pages/admin/Layout';
import DashBoard from './pages/admin/DashBoard';
import AddShows from './pages/admin/AddShows'
import ListShows from './pages/admin/ListShows';
import ListBookings from './pages/admin/ListBookings';
import { useAppContext } from './context/AppContext';
const App = () => {
  // Hide navbar/footer on admin routes
  const isAdminRoute = useLocation().pathname.startsWith('/admin')
  const {user} = useAppContext ()
  return (
    <div className='flex flex-col min-h-screen'>
      <Toaster />

      {!isAdminRoute && <Navbar />}

      <main className='flex-grow'>
        <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-white">Loading...</div>}>
          <Routes>
            <Route path='/' element={<Home />} />
            <Route path='/movies' element={<Movies />} />
            <Route path='/movies/:id' element={<MovieDetails />} />
            <Route path='/movies/:id/date' element={<SeatLayout />} />
            <Route path='/my-bookings' element={<MyBookings />} />
            <Route path='/favorite' element={<Favorite />} />
            <Route path='/releases' element={<Release />} />
            <Route path='/theater' element={<Theater />} />
            <Route path='/my-movies' element={<MyMovies />} />
            <Route path="/movies/:id/:date" element={<SeatLayout />} />
            <Route path="/admin/*" element={user?<Layout />:(
              <div className='min-h-screen flex justify-center items-center'>
                <SignIn fallbackRedirecUrl={'/admin'}/>
              </div>
            )}>
              <Route index element={<DashBoard />} />
              <Route path="add-shows" element={<AddShows />} />
              <Route path="list-shows" element={<ListShows />} />
              <Route path="add-bookings" element={<AddShows />} />
              <Route path="list-bookings" element={<ListBookings />} />
            </Route>
          </Routes>
        </Suspense>
      </main>

      {!isAdminRoute && <Footer />}
    </div>
  )
}

export default App