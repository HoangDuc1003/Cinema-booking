const HERO_RELOAD_COUNT_KEY = 'nitrocine:hero-reload-count';
const HERO_DAY_KEY = 'nitrocine:hero-day';
const HERO_SLICE_OFFSET_KEY = 'nitrocine:hero-slice-offset';

const getLocalStorageItem = (key) => {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.getItem(key);
        }
    } catch {
        /* ignore storage errors */
    }
    return null;
};

const setLocalStorageItem = (key, value) => {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, String(value));
        }
    } catch {
        /* ignore storage errors */
    }
};

export const resolveClientHeroOffset = () => {
    try {
        const currentDay = new Date().toISOString().slice(0, 10);
        const storedDay = getLocalStorageItem(HERO_DAY_KEY);
        let reloadCount = parseInt(getLocalStorageItem(HERO_RELOAD_COUNT_KEY) || '0', 10);
        let sliceOffset = parseInt(getLocalStorageItem(HERO_SLICE_OFFSET_KEY) || '0', 10);
        if (!Number.isFinite(reloadCount) || reloadCount < 0) reloadCount = 0;
        if (!Number.isFinite(sliceOffset) || sliceOffset < 0) sliceOffset = 0;

        let offsetChanged = false;
        if (storedDay !== currentDay) {
            if (storedDay !== null) {
                sliceOffset = (sliceOffset + 1) % 30;
                offsetChanged = true;
            }
            setLocalStorageItem(HERO_DAY_KEY, currentDay);
        }

        reloadCount += 1;
        if (reloadCount > 0 && reloadCount % 5 === 0) {
            sliceOffset = (sliceOffset + 1) % 30;
            offsetChanged = true;
        }

        setLocalStorageItem(HERO_RELOAD_COUNT_KEY, reloadCount);
        if (offsetChanged || getLocalStorageItem(HERO_SLICE_OFFSET_KEY) === null) {
            setLocalStorageItem(HERO_SLICE_OFFSET_KEY, sliceOffset);
        }

        return sliceOffset;
    } catch {
        return 0;
    }
};
