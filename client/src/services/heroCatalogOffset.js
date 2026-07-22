const HERO_SLICE_COUNT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const toValidDate = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
};

const padDatePart = (value) => String(value).padStart(2, '0');

export const getClientHeroDayKey = (now = new Date()) => {
    const date = toValidDate(now);
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
};

export const resolveClientHeroOffset = (now = new Date()) => {
    const date = toValidDate(now);
    const localDayOrdinal = Math.floor(Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
    ) / DAY_MS);
    return ((localDayOrdinal % HERO_SLICE_COUNT) + HERO_SLICE_COUNT) % HERO_SLICE_COUNT;
};

export const millisecondsUntilNextLocalMidnight = (now = new Date()) => {
    const date = toValidDate(now);
    const nextMidnight = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() + 1,
        0,
        0,
        0,
        0,
    );
    return Math.max(0, nextMidnight.getTime() - date.getTime());
};
