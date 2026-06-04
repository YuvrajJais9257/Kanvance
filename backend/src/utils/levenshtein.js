'use strict';

/**
 * Computes the Levenshtein (edit) distance between two strings.
 *
 * Uses the standard dynamic-programming algorithm with O(min(m,n)) space.
 *
 * @param {string} a - First string.
 * @param {string} b - Second string.
 * @returns {number} The minimum number of single-character edits
 *                   (insertions, deletions, substitutions) required to
 *                   transform `a` into `b`.
 */
function levenshtein(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    throw new TypeError('levenshtein: both arguments must be strings');
  }

  // Trivial cases
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure `a` is the shorter string to minimise memory usage
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const m = a.length;
  const n = b.length;

  // prev[j] = distance between a[0..i-1] and b[0..j-1]
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);

  for (let j = 0; j <= n; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost // substitution
      );
    }
    // Swap rows
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

module.exports = { levenshtein };
