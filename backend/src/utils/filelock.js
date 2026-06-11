'use strict';

const lockfile = require('proper-lockfile');
const fs = require('fs');
const path = require('path');

/**
 * Acquires a file lock on the given file path.
 *
 * Retries until the lock is acquired or the timeout elapses.
 * Throws an error if the lock cannot be acquired within `timeoutMs`.
 *
 * @param {string} filePath   - Absolute or relative path to the file to lock.
 * @param {number} timeoutMs  - Maximum time (ms) to wait for the lock.
 * @returns {Promise<() => Promise<void>>} A release function that unlocks the file.
 */
async function acquireLock(filePath, timeoutMs) {
  const resolvedPath = path.resolve(filePath);

  // proper-lockfile requires the target file to exist before locking.
  // If it doesn't exist yet (e.g. new workbook), create an empty placeholder.
  if (!fs.existsSync(resolvedPath)) {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolvedPath, '', 'utf8');
  }

  const deadline = Date.now() + timeoutMs;
  const retryIntervalMs = 200;

  while (true) {
    try {
      const release = await lockfile.lock(resolvedPath, {
        // stale: treat locks older than 2× timeout as stale
        stale: Math.max(timeoutMs * 2, 10000),
        retries: 0, // we handle retries ourselves for precise timeout control
      });
      return release;
    } catch (err) {
      // ELOCKED means another process holds the lock
      if (err.code !== 'ELOCKED') {
        throw err;
      }

      if (Date.now() + retryIntervalMs > deadline) {
        throw new Error(
          `[filelock] Could not acquire lock on "${resolvedPath}" within ${timeoutMs}ms`
        );
      }

      await _sleep(retryIntervalMs);
    }
  }
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { acquireLock };
