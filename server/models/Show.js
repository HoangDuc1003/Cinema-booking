import mongoose from "mongoose";

const showSchema = new mongoose.Schema(
    {
        movie: { type: String, required: true, ref: 'Movie' },
        showDateTime: { type: Date, required: true },
        showPrice: { type: Number, required: true },
        hall: { type: String, default: '' },
        occupiedSeats: { type: Object, default: {} }
    }, { minimize: false }
)

// Existing deployments may already contain duplicate show rows. Keep this index
// non-unique; seat inventory uniqueness is enforced by SeatReservation instead.
showSchema.index({ movie: 1, showDateTime: 1, hall: 1 });
showSchema.index({ showDateTime: 1 });

const Show = mongoose.model("Show", showSchema);
export default Show;
