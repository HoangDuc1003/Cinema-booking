const ROWS = new Map([
    ['A', { max: 9, multiplier: 2 }],
    ['B', { max: 9, multiplier: 2 }],
    ['C', { max: 18, multiplier: 1.5 }],
    ['D', { max: 18, multiplier: 1.5 }],
    ['E', { max: 18, multiplier: 1.5 }],
    ['F', { max: 18, multiplier: 1.5 }],
    ['G', { max: 18, multiplier: 1.5 }],
    ['H', { max: 18, multiplier: 1 }],
    ['I', { max: 18, multiplier: 1 }],
    ['J', { max: 18, multiplier: 1 }],
]);

export const normalizeSeats = (input, maxSeats = 8) => {
    if (!Array.isArray(input) || input.length === 0) {
        throw new TypeError('Select at least one seat.');
    }
    if (input.length > maxSeats) {
        throw new RangeError(`A booking may contain at most ${maxSeats} seats.`);
    }

    const seats = input.map((seat) => String(seat).trim().toUpperCase());
    if (new Set(seats).size !== seats.length) {
        throw new TypeError('Duplicate seats are not allowed.');
    }

    for (const seat of seats) {
        const match = /^([A-J])(\d{1,2})$/.exec(seat);
        const row = match && ROWS.get(match[1]);
        const number = match ? Number(match[2]) : 0;
        if (!row || number < 1 || number > row.max) {
            throw new TypeError(`Invalid seat: ${seat}`);
        }
    }

    return seats.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
};

export const calculateBookingAmount = (showPrice, seats) => {
    const basePrice = Number(showPrice);
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
        throw new TypeError('Show price is invalid.');
    }

    const total = seats.reduce((sum, seat) => {
        const multiplier = ROWS.get(seat[0])?.multiplier;
        if (!multiplier) throw new TypeError(`Invalid seat: ${seat}`);
        return sum + (basePrice * multiplier);
    }, 0);

    return Math.round(total * 100) / 100;
};

export const isMongoDuplicateKey = (error) => error?.code === 11000;
