import mongoose from "mongoose";

const showSchema = new mongoose.Schema(
    {
        movie: { type: String, required: true, ref: 'Movie' },
        showDateTime: { type: Date, required: true },
        showPrice: { type: Number, required: true },
        hall: { type: String, default: '' },
        occupiedSeats: { type: Object, default: {} },
        source: {
            type: String,
            enum: ['manual', 'tmdb-now-playing'],
            default: 'manual',
            index: true,
        },
        region: { type: String, default: 'VN' },
        bookingOpen: { type: Boolean, default: true, index: true },
        scheduleKey: { type: String, default: null },
        scheduleStatus: {
            type: String,
            enum: ['scheduled', 'closed'],
            default: 'scheduled',
            index: true,
        },
        syncBatchId: { type: String, default: null },
    }, {
        minimize: false,
        timestamps: true,
    },
)

// Keep the legacy schedule identity compatible with existing Atlas deployments.
// The generated sync additionally uses scheduleKey for cross-run idempotency.
showSchema.index({ movie: 1, showDateTime: 1, hall: 1 }, { unique: true });
showSchema.index({ showDateTime: 1 });
showSchema.index({ source: 1, region: 1, bookingOpen: 1, showDateTime: 1 });
showSchema.index(
    { scheduleKey: 1 },
    {
        unique: true,
        partialFilterExpression: {
            scheduleKey: { $type: 'string' },
        },
    },
);

const Show = mongoose.model("Show", showSchema);
export default Show;
