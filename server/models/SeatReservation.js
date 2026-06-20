import mongoose from 'mongoose';

const seatReservationSchema = new mongoose.Schema({
    show: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Show' },
    seat: { type: String, required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Booking' },
    user: { type: String, required: true, ref: 'User' },
    status: { type: String, enum: ['held', 'confirmed'], default: 'held', required: true },
    expiresAt: { type: Date, default: null },
}, { timestamps: true });

// This is the durable inventory invariant. Redis locks only reduce contention.
seatReservationSchema.index({ show: 1, seat: 1 }, { unique: true });
seatReservationSchema.index({ show: 1, status: 1, expiresAt: 1 });
seatReservationSchema.index({ booking: 1 });

const SeatReservation = mongoose.model('SeatReservation', seatReservationSchema);

export default SeatReservation;
