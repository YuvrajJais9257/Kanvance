const pool = require("../config/db");

const VALID_STATUSES = new Set([
  "Active",
  "Busy",
  "Away",
  "Be Right Back",
  "In a Meeting",
  "Offline",
]);

/**
 * Returns all users with their current availability status.
 * @returns {Promise<Array<{ id: number, name: string, status: string }>>}
 */
exports.getAll = async () => {
  const [rows] = await pool.execute(
    "SELECT id, name, availability AS status FROM users ORDER BY name ASC"
  );
  return rows;
};

/**
 * Returns a single user's availability status.
 * @param {number} userId
 * @returns {Promise<{ id: number, name: string, status: string } | null>}
 */
exports.getOne = async (userId) => {
  const [[row]] = await pool.execute(
    "SELECT id, name, availability AS status FROM users WHERE id = ?",
    [userId]
  );
  return row ?? null;
};

/**
 * Sets the availability status for a user.
 * Throws if status is not one of the six valid values.
 * @param {number} userId
 * @param {string} status
 * @returns {Promise<void>}
 */
exports.setStatus = async (userId, status) => {
  if (!VALID_STATUSES.has(status)) {
    const err = new Error(
      `Invalid status "${status}". Must be one of: ${[...VALID_STATUSES].join(", ")}`
    );
    err.status = 400;
    throw err;
  }
  await pool.execute(
    "UPDATE users SET availability = ?, availability_updated_at = NOW() WHERE id = ?",
    [status, userId]
  );
};

exports.VALID_STATUSES = VALID_STATUSES;
