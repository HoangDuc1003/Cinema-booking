export const HERO_ROTATION_HOURS = Number(process.env.HERO_ROTATION_HOURS) || 48;
export const HERO_ROTATION_PERIOD_MS = HERO_ROTATION_HOURS * 60 * 60 * 1000;
export const HERO_BATCH_SIZE = 5;
export const HERO_ROTATION_ANCHOR = process.env.HERO_ROTATION_ANCHOR || '2026-01-01T00:00:00+07:00';

export function resolveHeroRotationWindow(nowMs = Date.now()) {
    const anchorMs = Date.parse(HERO_ROTATION_ANCHOR);
    if (!Number.isFinite(anchorMs)) {
        throw new Error('Invalid HERO_ROTATION_ANCHOR');
    }

    const elapsedMs = Math.max(0, nowMs - anchorMs);
    const index = Math.floor(elapsedMs / HERO_ROTATION_PERIOD_MS);
    const startsAtMs = anchorMs + index * HERO_ROTATION_PERIOD_MS;
    const endsAtMs = startsAtMs + HERO_ROTATION_PERIOD_MS;

    return {
        index,
        key: `hero-48h-${index}`,
        startsAt: new Date(startsAtMs).toISOString(),
        endsAt: new Date(endsAtMs).toISOString(),
        periodMs: HERO_ROTATION_PERIOD_MS,
        batchSize: HERO_BATCH_SIZE,
    };
}
