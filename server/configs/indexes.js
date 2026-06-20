import Booking from '../models/Booking.js';
import SeatReservation from '../models/SeatReservation.js';

const state = globalThis.__nitroCineIndexState || { promise: null, ready: false };
globalThis.__nitroCineIndexState = state;

export const ensureCriticalIndexes = async () => {
    if (state.ready) return true;
    if (!state.promise) {
        state.promise = Promise.all([
            Booking.init(),
            SeatReservation.init(),
        ]).then(() => {
            state.ready = true;
            return true;
        }).catch((error) => {
            state.promise = null;
            throw error;
        });
    }
    return state.promise;
};

export default ensureCriticalIndexes;
