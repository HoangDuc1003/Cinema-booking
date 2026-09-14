import { getJson, setJson } from './cacheService.js';
import { getHeroPosterDateKey, getPublicHomeHero } from './heroService.js';
import { getPublicHomeNowShowing, HOME_NOW_SHOWING_LIMIT } from './homeNowShowingService.js';
import { redisKeys } from './redisKeys.js';

// Long enough that a showtime read does not recompute the Hero, short enough
// that the midnight Hero rotation reaches the schedule within minutes.
const SCHEDULE_MOVIES_TTL_SECONDS = 300;
// A set missing one of its sources is held only briefly, so a hiccup does not
// leave a Hero or Now Showing movie without showtimes for long.
const PARTIAL_SCHEDULE_MOVIES_TTL_SECONDS = 30;

const movieIdOf = (movie) => {
    const id = String(movie?._id ?? movie?.id ?? '').trim();
    return /^\d+$/.test(id) ? id : '';
};

/**
 * The movies that get showtimes: the five Hero posters and the home page's Now
 * Showing list. Nothing else on the site is scheduled.
 *
 * `complete` is false when either source failed. Callers that close shows must
 * not act on an incomplete set, or a Hero outage would close every Hero show.
 */
export const getScheduleMovies = async ({
    now = new Date(),
    loadHero = getPublicHomeHero,
    loadNowShowing = getPublicHomeNowShowing,
} = {}) => {
    const [hero, nowShowing] = await Promise.allSettled([
        loadHero({ now }),
        loadNowShowing({ limit: HOME_NOW_SHOWING_LIMIT, now }),
    ]);
    const failures = [];
    if (hero.status === 'rejected') failures.push({ source: 'hero', error: hero.reason });
    if (nowShowing.status === 'rejected') failures.push({ source: 'now-showing', error: nowShowing.reason });
    if (failures.length === 2) {
        throw Object.assign(new Error('Neither the Hero nor Now Showing is available to schedule.'), {
            code: 'SCHEDULE_SOURCES_UNAVAILABLE',
            statusCode: 503,
            cause: failures[0].error,
        });
    }

    const heroMovies = hero.status === 'fulfilled' ? (hero.value?.movies || []) : [];
    const nowShowingMovies = nowShowing.status === 'fulfilled'
        ? (nowShowing.value?.value?.results || []).slice(0, HOME_NOW_SHOWING_LIMIT)
        : [];
    const movies = new Map();
    for (const movie of [...heroMovies, ...nowShowingMovies]) {
        const id = movieIdOf(movie);
        if (id && !movies.has(id)) movies.set(id, movie);
    }
    return {
        movies: [...movies.values()],
        heroIds: heroMovies.map(movieIdOf).filter(Boolean),
        nowShowingIds: nowShowingMovies.map(movieIdOf).filter(Boolean),
        complete: failures.length === 0,
        failures: failures.map(({ source, error }) => ({
            source,
            errorCode: error?.code || error?.name || 'UNKNOWN',
        })),
    };
};

export const getScheduledMovieIds = async ({ now = new Date(), load = getScheduleMovies } = {}) => {
    const cacheKey = redisKeys.scheduleMovieIds(getHeroPosterDateKey(now));
    const cached = await getJson(cacheKey);
    if (Array.isArray(cached?.ids)) return cached.ids;

    const schedule = await load({ now });
    if (!schedule.complete) {
        console.warn(JSON.stringify({ event: 'schedule-movies-partial', failures: schedule.failures }));
    }
    const ids = schedule.movies.map(movieIdOf).filter(Boolean);
    await setJson(
        cacheKey,
        { ids, complete: schedule.complete },
        schedule.complete ? SCHEDULE_MOVIES_TTL_SECONDS : PARTIAL_SCHEDULE_MOVIES_TTL_SECONDS,
    );
    return ids;
};

export const isScheduledMovie = async (movieId, options = {}) => (
    (await getScheduledMovieIds(options)).includes(String(movieId || '').trim())
);
