import { connectRedis } from '../configs/redis.js';
import { redisKeys, redisTtl } from './redisKeys.js';

const RELEASE_HOLD_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
`;

export const createSeatHolds = async ({ showId, seats, bookingId }) => {
    try {
        const client = await connectRedis();
        if (!client?.isReady) return false;
        const multi = client.multi();
        for (const seat of seats) {
            multi.set(redisKeys.seatHold(showId, seat), String(bookingId), { EX: redisTtl.seatHold });
        }
        await multi.exec();
        return true;
    } catch (error) {
        console.warn('[Seat hold] Redis write skipped:', error.message);
        return false;
    }
};

export const releaseSeatHolds = async ({ showId, seats, bookingId }) => {
    try {
        const client = await connectRedis();
        if (!client?.isReady) return false;
        await Promise.all(seats.map((seat) => client.eval(RELEASE_HOLD_SCRIPT, {
            keys: [redisKeys.seatHold(showId, seat)],
            arguments: [String(bookingId)],
        })));
        return true;
    } catch (error) {
        console.warn('[Seat hold] Redis release skipped:', error.message);
        return false;
    }
};
