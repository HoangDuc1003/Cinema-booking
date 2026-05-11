import express from 'express'
import { createBooking, getOccupiedSeats, getUserBookings, payNowBooking, deleteBooking, payAllBookings } from '../controllers/bookingController.js';
import { requireAuth } from '@clerk/express';

const bookingRouter = express.Router();

bookingRouter.post('/create', requireAuth(), createBooking);
bookingRouter.post('/pay-now', requireAuth(), payNowBooking);
bookingRouter.post('/pay-all', requireAuth(), payAllBookings);
bookingRouter.delete('/:id', requireAuth(), deleteBooking);
bookingRouter.get('/seat/:showId', getOccupiedSeats);
bookingRouter.get('/my-bookings', requireAuth(), getUserBookings);

export default bookingRouter;
