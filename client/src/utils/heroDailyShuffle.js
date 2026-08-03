/**
 * Utility module for per-user deterministic daily shuffle of Hero movies.
 */

/**
 * 1. getVietnamDateKey
 * Returns YYYY-MM-DD in Asia/Ho_Chi_Minh timezone using Intl.DateTimeFormat
 */
export function getVietnamDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

/**
 * 2. getOrCreateAnonymousViewerId
 * Reads from localStorage key 'nitrocine:hero-viewer-id'.
 * If not found, creates one with crypto.randomUUID() or fallback Math.random().toString(36). Stores it.
 * If localStorage is blocked, uses a module-level session variable.
 */
let sessionViewerId = null;
export function getOrCreateAnonymousViewerId() {
  const storageKey = 'nitrocine:hero-viewer-id';
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) return stored;
    
    let newId;
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      newId = crypto.randomUUID();
    } else {
      newId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
    
    window.localStorage.setItem(storageKey, newId);
    return newId;
  } catch (e) {
    if (sessionViewerId) return sessionViewerId;
    sessionViewerId = 'session_' + Math.random().toString(36).substring(2, 15);
    return sessionViewerId;
  }
}

/**
 * 3. hashSeedSync
 * A simple synchronous string hash function (djb2 or similar) that returns a hex string.
 * Used for initial render before async SHA-256 is ready.
 */
export function hashSeedSync(input) {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i); /* hash * 33 + c */
  }
  // Convert to unsigned 32-bit integer and then to hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * 4. hashSeedAsync
 * Uses crypto.subtle.digest('SHA-256', ...) to hash the input string.
 * Returns a hex string promise.
 */
export async function hashSeedAsync(input) {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Fallback if subtle crypto is not available
    return hashSeedSync(input);
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * 5. createSeededRandom
 * Takes a hex string seed, extracts 4 bytes from it to create a 32-bit integer,
 * returns a function that generates deterministic pseudo-random numbers between 0 and 1 using a mulberry32 PRNG.
 */
export function createSeededRandom(seedHex) {
  // Parse up to 8 chars (4 bytes) of the hex string to an integer
  let a = parseInt(seedHex.substring(0, 8), 16) || 0;
  
  // mulberry32 PRNG
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 6. seededShuffle
 * Fisher-Yates shuffle using the provided random function. MUST NOT mutate the input array.
 * Returns a new shuffled array.
 */
export function seededShuffle(array, randomFn) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 7. removeDuplicateMovies
 * Removes duplicates by movie ID (movie._id || movie.id). Preserves order.
 */
export function removeDuplicateMovies(movies) {
  const seen = new Set();
  return movies.filter(movie => {
    const id = movie._id || movie.id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * 8. chooseNonRepeatingDailyOrder
 * Main orchestrator:
 * - Creates seedInput = `${rotationVersion}:${dateKey}:${viewerKey}:${dailyEntropy}`
 * - Hashes with hashSeedSync
 * - Shuffles with seededShuffle
 * - If previousDay exists and movies.length > 1:
 *   a. If candidate first movie ID matches previousDay.firstMovieId, deterministically rotate the array by 1 position
 *   b. If entire order matches previousDay.order, try up to 10 re-shuffles with attempt seeds `${seedInput}:attempt:${i}`
 *   c. If still matching after 10 attempts, rotate by 1 position as final fallback
 * - Returns { order: string[] (movie IDs), firstMovieId: string }
 */
export function chooseNonRepeatingDailyOrder({ movies, dateKey, rotationVersion, dailyEntropy, viewerKey, previousDay }) {
  if (!movies || movies.length === 0) return { order: [], firstMovieId: null };
  
  const movieIds = movies.map(m => String(m._id || m.id));
  if (movieIds.length === 1) return { order: movieIds, firstMovieId: movieIds[0] };
  
  const seedInput = `${rotationVersion}:${dateKey}:${viewerKey}:${dailyEntropy}`;
  const seedHex = hashSeedSync(seedInput);
  const randomFn = createSeededRandom(seedHex);
  let order = seededShuffle(movieIds, randomFn);
  
  if (previousDay) {
    const arraysMatch = (a, b) => a.length === b.length && a.every((val, index) => val === b[index]);
    
    // Check if entire order matches previousDay.order
    if (previousDay.order && arraysMatch(order, previousDay.order)) {
      let resolved = false;
      for (let i = 0; i < 10; i++) {
        const attemptSeedInput = `${seedInput}:attempt:${i}`;
        const attemptSeedHex = hashSeedSync(attemptSeedInput);
        const attemptRandomFn = createSeededRandom(attemptSeedHex);
        const attemptOrder = seededShuffle(movieIds, attemptRandomFn);
        
        if (!arraysMatch(attemptOrder, previousDay.order)) {
          order = attemptOrder;
          resolved = true;
          break;
        }
      }
      
      // Final fallback rotate if still matching
      if (!resolved) {
        order.push(order.shift());
      }
    }
    
    // Check if first movie matches
    if (order[0] === previousDay.firstMovieId) {
      order.push(order.shift());
    }
  }
  
  return {
    order,
    firstMovieId: order[0]
  };
}

/**
 * 9. readHeroOrderHistory
 * Reads from localStorage key 'nitrocine:hero-order-history'.
 * Returns parsed object with schema version check. Returns null if invalid or missing.
 * Schema: { version: 1, days: [{ dateKey, rotationVersion, firstMovieId, order }] }
 */
export function readHeroOrderHistory() {
  try {
    const data = window.localStorage.getItem('nitrocine:hero-order-history');
    if (!data) return null;
    
    const parsed = JSON.parse(data);
    if (parsed.version !== 1 || !Array.isArray(parsed.days)) return null;
    
    return parsed;
  } catch (e) {
    return null;
  }
}

/**
 * 10. writeHeroOrderHistory
 * Writes to localStorage. Keeps only last 7 days. Handles storage errors gracefully.
 */
export function writeHeroOrderHistory(history) {
  try {
    if (history.days && history.days.length > 7) {
      history.days = history.days.slice(-7);
    }
    window.localStorage.setItem('nitrocine:hero-order-history', JSON.stringify(history));
  } catch (e) {
    // Ignore storage errors
  }
}

/**
 * 11. getOrComputeDailyOrder
 * - Gets dateKey from meta.dateKey or computes via getVietnamDateKey()
 * - Reads history
 * - If today's order exists in history with matching rotationVersion, returns it
 * - Otherwise computes new order via chooseNonRepeatingDailyOrder
 * - Saves to history
 * - Returns the ordered movie IDs array
 */
export function getOrComputeDailyOrder({ movies, meta = {}, viewerKey }) {
  if (!movies || movies.length === 0) return [];
  
  const mode = meta.mode || meta.configuredMode || meta.effectiveMode || meta.settingsMode;
  if (mode === 'manual' || meta.source === 'manual-selection') {
    return movies.map((m) => String(m._id || m.id));
  }

  const dateKey = meta.dateKey || getVietnamDateKey();
  const rotationVersion = meta.rotationVersion || '1';
  const dailyEntropy = meta.dailyEntropy || '';
  
  const history = readHeroOrderHistory() || { version: 1, days: [] };
  
  const todayEntry = history.days.find(d => d.dateKey === dateKey && d.rotationVersion === rotationVersion);
  if (todayEntry) {
    return todayEntry.order;
  }
  
  const previousDay = history.days.length > 0 ? history.days[history.days.length - 1] : null;
  
  const uniqueMovies = removeDuplicateMovies(movies);
  const result = chooseNonRepeatingDailyOrder({
    movies: uniqueMovies,
    dateKey,
    rotationVersion,
    dailyEntropy,
    viewerKey,
    previousDay
  });
  
  history.days.push({
    dateKey,
    rotationVersion,
    firstMovieId: result.firstMovieId,
    order: result.order
  });
  
  writeHeroOrderHistory(history);
  
  return result.order;
}

/**
 * 12. applyDailyOrder
 * Reorders the movies array according to orderedIds.
 * Movies not in orderedIds are appended at the end. Returns a new array.
 */
export function applyDailyOrder(movies, orderedIds) {
  if (!movies || movies.length === 0) return [];
  if (!orderedIds || orderedIds.length === 0) return [...movies];
  
  const uniqueMovies = removeDuplicateMovies(movies);
  const movieMap = new Map();
  uniqueMovies.forEach(m => movieMap.set(String(m._id || m.id), m));
  
  const result = [];
  const addedIds = new Set();
  
  orderedIds.forEach(id => {
    if (movieMap.has(id)) {
      result.push(movieMap.get(id));
      addedIds.add(id);
    }
  });
  
  uniqueMovies.forEach(m => {
    const id = String(m._id || m.id);
    if (!addedIds.has(id)) {
      result.push(m);
    }
  });
  
  return result;
}
