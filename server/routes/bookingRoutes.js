import express from 'express'
import { createBooking, getOccupiedSeats, getUserBookings } from '../controllers/bookingController.js';
import { requireAuth } from '@clerk/express';

const bookingRouter = express.Router();

bookingRouter.post('/create', requireAuth(), createBooking);
bookingRouter.get('/seat/:showId', getOccupiedSeats);
bookingRouter.get('/my-bookings', requireAuth(), getUserBookings);

export default bookingRouter;
