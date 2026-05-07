import React, { Suspense, lazy } from 'react'
import Navbar from './components/Navbar'
import { Route, Routes, useLocation } from 'react-router-dom'

// Feature: lazy-loaded routes
const Home = lazy(() => import('./pages/Home'));
const Movies = lazy(() => import('./pages/Movies'));
const MovieDetails = lazy(() => import('./pages/MovieDetails'));
const SeatLayout = lazy(() => import('./pages/SeatLayout'));
const Favorite = lazy(() => import('./pages/Farvorite'));
const MyBookings = lazy(() => import('./pages/MyBookings'));
const MyMovies = lazy(() => import('./pages/MyMovies'));

import { Toaster } from 'react-hot-toast'
import Footer from './components/Footer'
// Feat: admin
import Layout from './pages/admin/Layout';
import DashBoard from './pages/admin/DashBoard';
import AddShows from './pages/admin/AddShows'
import ListShows from './pages/admin/ListShows';
import ListBookings from './pages/admin/ListBookings';
// Feature: main App with routing
const App = () => {
  // Admin route check
  const isAdminRoute = useLocation().pathname.startsWith('/admin')

  return (
    <>
      {/* App layout + toast */}
      <Toaster />
      {/* Feature: navigation bar (hidden on admin routes) */}
      {!isAdminRoute && <Navbar />}
      {/* Feature: routing */}
      <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-white">Loading...</div>}>
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/movies' element={<Movies />} />
          <Route path='/movies/:id' element={<MovieDetails />} />
          <Route path='/movies/:id/date' element={<SeatLayout />} />
          <Route path='/my-bookings' element={<MyBookings />} />
          <Route path='/favorite' element={<Favorite />} />
          <Route path='/my-movies' element={<MyMovies />} />
          <Route path="/movies/:id/:date" element={<SeatLayout />} />
          <Route path="/admin/*" element={<Layout />}>
            <Route index element={<DashBoard />} />
            <Route path="add-shows" element={<AddShows />} />
            <Route path="list-shows" element={<ListShows />} />
            <Route path="add-bookings" element={<AddShows />} />
            <Route path="list-bookings" element={<ListBookings />} />
          </Route>
        </Routes>
      </Suspense>
      {/* Feature: footer */}
      {!isAdminRoute && <Footer />}
    </>
  )
}

export default App