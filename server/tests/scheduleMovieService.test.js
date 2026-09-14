import assert from 'node:assert/strict';
import test from 'node:test';
import { getScheduleMovies } from '../services/scheduleMovieService.js';

const hero = (...ids) => async () => ({ movies: ids.map((id) => ({ _id: String(id), id: String(id), title: `Hero ${id}` })) });
const nowShowing = (...ids) => async ({ limit }) => ({
    value: { results: ids.slice(0, limit).map((id) => ({ _id: String(id), id, title: `Now ${id}` })) },
});
const down = (code) => async () => { throw Object.assign(new Error(code), { code }); };

test('the schedule is the five Hero posters plus the ten home Now Showing movies, de-duplicated', async () => {
    const schedule = await getScheduleMovies({
        loadHero: hero(1, 2, 900, 901, 902),
        // Twelve are available but the home page shows ten; 1 and 2 are also on the Hero.
        loadNowShowing: nowShowing(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
    });
    assert.equal(schedule.complete, true);
    assert.deepEqual(schedule.heroIds, ['1', '2', '900', '901', '902']);
    assert.equal(schedule.nowShowingIds.length, 10);
    assert.deepEqual(schedule.movies.map((movie) => String(movie._id)).sort((a, b) => a - b), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '900', '901', '902']);
    assert.ok(!schedule.movies.some((movie) => ['11', '12'].includes(String(movie._id))), 'movies not on the home page get no showtimes');
});

test('one source down gives a partial set that says so', async () => {
    const schedule = await getScheduleMovies({ loadHero: down('HERO_POOL_TOO_SMALL'), loadNowShowing: nowShowing(3, 4) });
    assert.equal(schedule.complete, false);
    assert.deepEqual(schedule.movies.map((movie) => String(movie._id)), ['3', '4']);
    assert.deepEqual(schedule.failures, [{ source: 'hero', errorCode: 'HERO_POOL_TOO_SMALL' }]);
});

test('both sources down is an error, never an empty schedule', async () => {
    await assert.rejects(
        () => getScheduleMovies({ loadHero: down('A'), loadNowShowing: down('B') }),
        (error) => error.code === 'SCHEDULE_SOURCES_UNAVAILABLE' && error.statusCode === 503,
    );
});
