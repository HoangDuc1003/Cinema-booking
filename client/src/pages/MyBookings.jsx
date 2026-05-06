import React, { useState } from 'react'

const MyBookings = () => {
  const currency= import.meta.env.VITE_CURRENCY
  const [bookings,setBooking] = useState([])
  const [isLoading,setIsLoading] = useState(true)
  return (
    <div>
      
    </div>
  )
}

export default MyBookings