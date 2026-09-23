import { useSyncExternalStore } from 'react';

// Favorites live in localStorage so they work signed out. Every reader and writer
// goes through here so the key, the id rule and the change event stay in one place.
const STORAGE_KEY = 'nitro_favorites';
const CHANGE_EVENT = 'favoritesUpdated';
const EMPTY = Object.freeze([]);

// Server movies carry a string `_id`, TMDB details a numeric `id`: compare as strings
// so the same film is recognised whichever page saved it.
export const favoriteKey = (movie) => String(movie?._id || movie?.id || '');

const parse = (raw) => {
    try {
        const value = JSON.parse(raw || '[]');
        return Array.isArray(value) ? value : EMPTY;
    } catch {
        return EMPTY;
    }
};

const readRaw = () => {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        // Storage blocked (private mode, sandboxed iframe): behave as an empty list.
        return null;
    }
};

// useSyncExternalStore needs a stable snapshot, so the parsed list is reused
// until the stored string actually changes.
let cachedRaw;
let cachedList = EMPTY;
export const readFavorites = () => {
    const raw = readRaw();
    if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedList = parse(raw);
    }
    return cachedList;
};

const subscribe = (onChange) => {
    window.addEventListener(CHANGE_EVENT, onChange);
    // `storage` fires for writes from other tabs.
    window.addEventListener('storage', onChange);
    return () => {
        window.removeEventListener(CHANGE_EVENT, onChange);
        window.removeEventListener('storage', onChange);
    };
};

export const useFavorites = () => useSyncExternalStore(subscribe, readFavorites, () => EMPTY);

export const isFavorite = (favorites, movie) => {
    const key = favoriteKey(movie);
    return Boolean(key) && favorites.some((favorite) => favoriteKey(favorite) === key);
};

/**
 * Adds or removes a movie based on what is stored now, not on a component's
 * possibly stale state. Returns the new favorited state, or null when the
 * browser refused the write.
 */
export const toggleFavorite = (movie) => {
    const favorites = readFavorites();
    const wasFavorite = isFavorite(favorites, movie);
    const key = favoriteKey(movie);
    const next = wasFavorite
        ? favorites.filter((favorite) => favoriteKey(favorite) !== key)
        : [...favorites, movie];
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        return null;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return !wasFavorite;
};
