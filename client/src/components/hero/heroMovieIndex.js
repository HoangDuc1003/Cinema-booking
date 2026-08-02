/**
 * Canonical index normalization for the Hero carousel.
 * All movie-switching paths should use this function to ensure
 * the index wraps correctly within the movie array bounds.
 *
 * @param {number} index - The raw index (may be negative or exceed array length)
 * @param {number} total - Total number of movies
 * @returns {number} A valid index in range [0, total - 1], or 0 if total <= 0
 */
export const normalizeMovieIndex = (index, total) => {
  if (!Number.isInteger(total) || total <= 0) return 0;
  return ((index % total) + total) % total;
};
