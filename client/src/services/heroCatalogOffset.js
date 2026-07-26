const HERO_SLICE_COUNT = 30;
const TWO_DAYS_MS = 48 * 60 * 60 * 1000;

const toValidDate = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
};

const padDatePart = (value) => String(value).padStart(2, '0');

export const getHeroRotationKey = (rotationOrDate) => {
    if (rotationOrDate && typeof rotationOrDate === 'object' && rotationOrDate.key) {
        return rotationOrDate.key;
    }
    const date = toValidDate(rotationOrDate);
    const dayPeriod = Math.floor(date.getTime() / TWO_DAYS_MS);
    return `hero-48h-${dayPeriod}`;
};

export const getClientHeroDayKey = (now = new Date()) => {
    const date = toValidDate(now);
    const dayPeriod = Math.floor(date.getTime() / TWO_DAYS_MS);
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}-2D-${dayPeriod % 100}`;
};

export const resolveClientHeroOffset = (now = new Date()) => {
    const date = toValidDate(now);
    const periodIndex = Math.floor(date.getTime() / TWO_DAYS_MS);
    return ((periodIndex % HERO_SLICE_COUNT) + HERO_SLICE_COUNT) % HERO_SLICE_COUNT;
};

export const millisecondsUntilRotationEnd = (endsAt, nowMs = Date.now()) => {
    const endsAtMs = typeof endsAt === 'number' ? endsAt : Date.parse(endsAt);
    if (!Number.isFinite(endsAtMs)) return null;
    return Math.max(0, endsAtMs - nowMs);
};

export const millisecondsUntilNextHeroRotation = (now = new Date(), endsAt = null) => {
    if (endsAt) {
        const remaining = millisecondsUntilRotationEnd(endsAt, now instanceof Date ? now.getTime() : now);
        if (remaining != null) return remaining;
    }
    const date = toValidDate(now);
    const currentMs = date.getTime();
    const nextPeriodMs = (Math.floor(currentMs / TWO_DAYS_MS) + 1) * TWO_DAYS_MS;
    return Math.max(0, nextPeriodMs - currentMs);
};
