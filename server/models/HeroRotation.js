import mongoose from 'mongoose';

// One document per 12-hour Hero slot, keyed by the slot's Vietnam start
// (`2026-10-06T12:00`). It fixes the slot's line-up for every visitor and is the
// history that keeps a movie off the Hero for 30 days after it was shown.
const heroRotationSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    startsAt: { type: Date, required: true },
    // The line-up on screen, in display order.
    movieIds: { type: [String], required: true },
    // Everything this slot has shown, including posters an admin reshuffled away.
    shownMovieIds: { type: [String], default: [] },
    // How many of the line-up had to come back early because fewer than five
    // movies were left unshown in the last 30 days.
    reusedCount: { type: Number, default: 0 },
}, { timestamps: true });

// History older than two no-repeat windows is never read again.
heroRotationSchema.index({ startsAt: 1 }, { expireAfterSeconds: 60 * 86400, name: 'hero_rotation_starts_at_ttl' });

const HeroRotation = mongoose.model('HeroRotation', heroRotationSchema);
export default HeroRotation;
