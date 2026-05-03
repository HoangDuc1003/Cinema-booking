import React from 'react'
import Navbar from './components/Navbar'
import {Route ,Routes ,useLocation} from 'react-router-dom'
import Home from './pages/Home'
import Movies from './pages/Movies'
import MovieDetails from './pages/MovieDetails'
import SeatLayout from './pages/SeatLayout'
import Favorite from './pages/Farvorite'
import MyBookings from './pages/MyBookings'
import MyMovies from './pages/MyMovies'
import {Toaster} from 'react-hot-toast'
import Footer from './components/Footer'


const App = () => {

  const isAdminRoute = useLocation().pathname.startsWith('/admin')

  return (
    <>
      <Toaster/>
      {!isAdminRoute && <Navbar/>}
      <Routes>
        <Route path='/' element={<Home/>}/>
        <Route path='/movie' element={<Movies/>}/>
        <Route path='/movie/:id' element={<MovieDetails/>}/>
        <Route path='/movie/:id/date' element={<SeatLayout/>}/>
        <Route path='/my-bookings' element={<MyBookings/>}/>
        <Route path='/favorite' element={<Favorite/>}/>
        <Route path='/my-movies' element={<MyMovies/>}/>
      </Routes>
      {!isAdminRoute && <Footer/>}
    </>
  )
}

export default App