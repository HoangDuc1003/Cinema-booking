import React, { Suspense, lazy } from 'react'
import Navbar from './components/Navbar'
import { Route, Routes, useLocation } from 'react-router-dom'
import { SignIn } from '@clerk/react';
import { Toaster } from 'react-hot-toast'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'
import { useAppContext } from './context/AppContext';
import Loading from './components/Loading';

const Home = lazy(() => import('./pages/Home'));
const Movies = lazy(() => import('./pages/Movies'));
const MovieDetails = lazy(() => import('./pages/MovieDetails'));
const SeatLayout = lazy(() => import('./pages/SeatLayout'));
const Favorite = lazy(() => import('./pages/Favorite'));
const MyBookings = lazy(() => import('./pages/MyBookings'));
const MyMovies = lazy(() => import('./pages/MyMovies'));
const Release = lazy(() => import('./pages/Release'));
const Theater = lazy(() => import('./pages/Theater'));

// Admin pages
const Layout = lazy(() => import('./pages/admin/Layout'));
const DashBoard = lazy(() => import('./pages/admin/DashBoard'));
const AddShows = lazy(() => import('./pages/admin/AddShows'));
const ListShows = lazy(() => import('./pages/admin/ListShows'));
const ListBookings = lazy(() => import('./pages/admin/ListBookings'));
const HeroSettings = lazy(() => import('./pages/admin/HeroSettings'));

// Keep the cinematic loading surface consistent while route chunks resolve.
const PageFallback = () => <Loading />;

const AppRoutes = ({ includeAdmin = false, user = null }) => (
  <Routes>
    <Route path='/' element={<ErrorBoundary><Home /></ErrorBoundary>} />
    <Route path='/movies' element={<ErrorBoundary><Movies /></ErrorBoundary>} />
    <Route path='/movies/:id' element={<ErrorBoundary><MovieDetails /></ErrorBoundary>} />
    <Route path='/my-bookings' element={<ErrorBoundary><MyBookings /></ErrorBoundary>} />
    <Route path='/loading/:nextUrl' element={<ErrorBoundary><Loading /></ErrorBoundary>} />
    <Route path='/favorite' element={<ErrorBoundary><Favorite /></ErrorBoundary>} />
    <Route path='/releases' element={<ErrorBoundary><Release /></ErrorBoundary>} />
    <Route path='/theater' element={<ErrorBoundary><Theater /></ErrorBoundary>} />
    <Route path='/my-movies' element={<ErrorBoundary><MyMovies /></ErrorBoundary>} />
    <Route path="/movies/:id/:date" element={<ErrorBoundary><SeatLayout /></ErrorBoundary>} />
    {includeAdmin && <Route path="/admin/*" element={user ? (
      <ErrorBoundary><Layout /></ErrorBoundary>
    ) : (
      <div className='min-h-screen flex justify-center items-center'>
        <SignIn fallbackRedirectUrl={'/admin'} />
      </div>
    )}>
      <Route index element={<DashBoard />} />
      <Route path="add-shows" element={<AddShows />} />
      <Route path="hero" element={<HeroSettings />} />
      <Route path="list-shows" element={<ListShows />} />
      <Route path="add-bookings" element={<AddShows />} />
      <Route path="list-bookings" element={<ListBookings />} />
    </Route>}
  </Routes>
);

const App = () => {
  // Hide navbar/footer on admin routes
  const isAdminRoute = useLocation().pathname.startsWith('/admin')
  const { user } = useAppContext()

  return (
    <div className='flex flex-col min-h-screen overflow-x-hidden w-full bg-black text-white'>
      <Toaster />

      {!isAdminRoute && <Navbar />}

      <main className='flex-grow w-full overflow-x-hidden'>
        <Suspense fallback={<PageFallback />}>
          <AppRoutes includeAdmin user={user} />
        </Suspense>
      </main>

      {!isAdminRoute && <Footer />}
    </div>
  )
}

export default App
