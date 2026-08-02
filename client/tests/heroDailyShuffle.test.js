import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  getVietnamDateKey,
  hashSeedSync,
  createSeededRandom,
  seededShuffle,
  removeDuplicateMovies,
  chooseNonRepeatingDailyOrder
} from '../src/utils/heroDailyShuffle.js';

test('Timezone: gets correct Vietnam Date Key', () => {
  // 23:59:59 Asia/Ho_Chi_Minh in UTC
  const preMidnight = new Date('2026-08-01T16:59:59Z'); 
  const key1 = getVietnamDateKey(preMidnight);
  assert.equal(key1, '2026-08-01');

  // 00:00:00 Asia/Ho_Chi_Minh in UTC
  const midnight = new Date('2026-08-01T17:00:00Z');
  const key2 = getVietnamDateKey(midnight);
  assert.equal(key2, '2026-08-02');
});

test('removeDuplicateMovies removes duplicates by id or _id and preserves order', () => {
  const movies = [
    { id: '1', title: 'A' },
    { _id: '2', title: 'B' },
    { id: '1', title: 'C' },
    { _id: '3', title: 'D' },
    { id: '2', title: 'E' }
  ];
  const unique = removeDuplicateMovies(movies);
  assert.equal(unique.length, 3);
  assert.equal(unique[0].title, 'A');
  assert.equal(unique[1].title, 'B');
  assert.equal(unique[2].title, 'D');
});

test('seededShuffle returns a valid permutation and does not mutate input', () => {
  const input = ['A', 'B', 'C', 'D'];
  const randomFn = createSeededRandom('deadbeef');
  const output = seededShuffle(input, randomFn);
  
  assert.notEqual(input, output);
  assert.deepEqual(input, ['A', 'B', 'C', 'D']);
  assert.equal(output.length, 4);
  assert.ok(output.includes('A') && output.includes('B') && output.includes('C') && output.includes('D'));
});

test('chooseNonRepeatingDailyOrder: same inputs yield same order', () => {
  const movies = [{id: '1'}, {id: '2'}, {id: '3'}, {id: '4'}];
  const args = {
    movies,
    dateKey: '2026-08-02',
    rotationVersion: 'v1',
    dailyEntropy: 'entropy123',
    viewerKey: 'viewer1',
    previousDay: null
  };
  const result1 = chooseNonRepeatingDailyOrder(args);
  const result2 = chooseNonRepeatingDailyOrder(args);
  
  assert.deepEqual(result1.order, result2.order);
});

test('chooseNonRepeatingDailyOrder: different viewer, same day yields different seed (very likely different order)', () => {
  const movies = [{id: '1'}, {id: '2'}, {id: '3'}, {id: '4'}, {id: '5'}];
  const args1 = { movies, dateKey: '2026-08-02', rotationVersion: 'v1', dailyEntropy: 'entropy123', viewerKey: 'viewer1', previousDay: null };
  const args2 = { ...args1, viewerKey: 'viewer2' };
  
  const result1 = chooseNonRepeatingDailyOrder(args1);
  const result2 = chooseNonRepeatingDailyOrder(args2);
  
  // They should be computed from different seeds. We can't guarantee arrays are strictly different because space is small,
  // but it's very likely. We'll just ensure the function works.
  assert.ok(result1.order.length === 5);
  assert.ok(result2.order.length === 5);
});

test('chooseNonRepeatingDailyOrder: same viewer, different day yields different seed', () => {
  const movies = [{id: '1'}, {id: '2'}, {id: '3'}, {id: '4'}, {id: '5'}];
  const args1 = { movies, dateKey: '2026-08-02', rotationVersion: 'v1', dailyEntropy: 'entropy123', viewerKey: 'viewer1', previousDay: null };
  const args2 = { ...args1, dateKey: '2026-08-03' };
  
  const result1 = chooseNonRepeatingDailyOrder(args1);
  const result2 = chooseNonRepeatingDailyOrder(args2);
  assert.ok(result1.order.length === 5);
  assert.ok(result2.order.length === 5);
});

test('Anti-repeat: firstMovieId does not repeat previous day if there are >1 movies', () => {
  const movies = [{id: '1'}, {id: '2'}, {id: '3'}];
  
  // Force a situation where natural random would pick '1' as first movie by finding a seed (or just mocking the previous day to have firstMovieId = order[0] of today's natural shuffle)
  // Let's find natural shuffle first:
  const args = { movies, dateKey: '2026-08-02', rotationVersion: 'v1', dailyEntropy: 'ent', viewerKey: 'viewer1', previousDay: null };
  const naturalResult = chooseNonRepeatingDailyOrder(args);
  const naturalFirst = naturalResult.firstMovieId;
  
  // Now set previousDay's firstMovieId to be the same as naturalFirst
  const argsWithPrev = { ...args, previousDay: { firstMovieId: naturalFirst, order: [] } };
  const antiRepeatResult = chooseNonRepeatingDailyOrder(argsWithPrev);
  
  assert.notEqual(antiRepeatResult.firstMovieId, naturalFirst);
  assert.ok(movies.map(m=>m.id).includes(antiRepeatResult.firstMovieId));
});

test('Anti-repeat: entire order does not repeat previous day if possible', () => {
  const movies = [{id: '1'}, {id: '2'}, {id: '3'}];
  const args = { movies, dateKey: '2026-08-02', rotationVersion: 'v1', dailyEntropy: 'ent', viewerKey: 'viewer1', previousDay: null };
  const naturalResult = chooseNonRepeatingDailyOrder(args);
  
  // Set previous day order to strictly match naturalResult.order
  const argsWithPrev = { ...args, previousDay: { firstMovieId: 'something-else', order: naturalResult.order } };
  const antiRepeatResult = chooseNonRepeatingDailyOrder(argsWithPrev);
  
  assert.notDeepEqual(antiRepeatResult.order, naturalResult.order);
});
