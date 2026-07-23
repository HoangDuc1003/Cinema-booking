const HERO_SLICE_COUNT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const toValidDate = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
};

const padDatePart = (value) => String(value).padStart(2, '0');

export const getClientHeroDayKey = (now = new Date()) => {
    const date = toValidDate(now);
    const half = date.getHours() < 12 ? 'AM' : 'PM';
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}-${half}`;
};

export const resolveClientHeroOffset = (now = new Date()) => {
    const date = toValidDate(now);
    const localDayOrdinal = Math.floor(Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
    ) / DAY_MS);
    const halfDayIndex = date.getHours() < 12 ? 0 : 1;
    const slot = localDayOrdinal * 2 + halfDayIndex;
    return ((slot % HERO_SLICE_COUNT) + HERO_SLICE_COUNT) % HERO_SLICE_COUNT;
};

export const millisecondsUntilNextHeroRotation = (now = new Date()) => {
    const date = toValidDate(now);
    const hours = date.getHours();
    const nextBoundary = hours < 12
        ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0)
        : new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
    return Math.max(0, nextBoundary.getTime() - date.getTime());
};
