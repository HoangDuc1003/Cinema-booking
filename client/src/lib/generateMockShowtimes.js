const seededRandom = (seed) => {
  let t = seed + 0x6D2B79F5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Get a seeded random number between min and max
const seededRange = (seed, min, max) => {
  return Math.floor(seededRandom(seed) * (max - min + 1)) + min;
};

const HALLS = [
  'NitroCine Hall A',
  'NitroCine Hall B',
  'NitroCine IMAX',
  'NitroCine Premium',
  'NitroCine Dolby Atmos',
];

const TIME_SLOTS = [
  '09:30', '10:00', '11:15', '12:00', '13:30',
  '14:00', '15:15', '16:00', '17:30', '18:00',
  '19:00', '19:30', '20:00', '21:00', '21:30', '22:00',
];

const PRICES = [8, 10, 12, 14, 15, 18, 20];

const generateMockShowtimes = (movieId, daysAhead = 5) => {
  const id = typeof movieId === 'string' ? parseInt(movieId, 10) || 0 : movieId || 0;
  const dateTime = {};

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let d = 0; d < daysAhead; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() + d);

    // Format as YYYY-MM-DD
    const dateStr = date.toISOString().split('T')[0];

    // Generate 3-6 showtimes per day (seeded by movie ID + day offset)
    const seed = id * 31 + d * 7;
    const numShowtimes = seededRange(seed, 3, 6);

    const dayShowtimes = [];
    const usedTimes = new Set();

    for (let s = 0; s < numShowtimes; s++) {
      const timeSeed = seed * 13 + s * 17;

      // Pick a unique time slot
      let timeIndex = seededRange(timeSeed, 0, TIME_SLOTS.length - 1);
      let attempts = 0;
      while (usedTimes.has(timeIndex) && attempts < TIME_SLOTS.length) {
        timeIndex = (timeIndex + 1) % TIME_SLOTS.length;
        attempts++;
      }
      if (usedTimes.has(timeIndex)) continue;
      usedTimes.add(timeIndex);

      // Pick hall (seeded)
      const hallIndex = seededRange(timeSeed + 3, 0, HALLS.length - 1);
      const hall = HALLS[hallIndex];

      // Pick price (seeded, higher for premium halls)
      let priceIndex = seededRange(timeSeed + 7, 0, PRICES.length - 1);
      let price = PRICES[priceIndex];
      if (hall.includes('IMAX')) price = Math.max(price, 15);
      if (hall.includes('Premium')) price = Math.max(price, 18);
      if (hall.includes('Dolby')) price = Math.max(price, 16);

      // Create showtime entry
      const timeStr = TIME_SLOTS[timeIndex];
      const showId = `mock_${id}_${dateStr}_${s}`;

      dayShowtimes.push({
        showId,
        _id: showId,
        id: showId,
        time: `${dateStr}T${timeStr}:00.000Z`,
        hall,
        price,
      });
    }

    // Sort by time
    dayShowtimes.sort((a, b) => a.time.localeCompare(b.time));
    dateTime[dateStr] = dayShowtimes;
  }

  return dateTime;
};

export default generateMockShowtimes;
