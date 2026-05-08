/**
 * auth.model.js
 *
 * Thin auth-specific queries kept for backward compatibility with
 * the register endpoint. Login now goes through user.model.js directly.
 * All queries exclude soft-deleted rows (deleted_at IS NULL).
 */
const pool = require("../config/db");

exports.findByEmail = async (email) => {
  const [[row]] = await pool.execute(
    `SELECT id, name, email, password_hash, role, status
     FROM users
     WHERE email = ? AND deleted_at IS NULL`,
    [email]
  );
  return row ?? null;
};

exports.findById = async (id) => {
  const [[row]] = await pool.execute(
    `SELECT id, name, username, email, role, status
     FROM users
     WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  return row ?? null;
};

exports.setPassword = async (id, hash) => {
  await pool.execute(
    "UPDATE users SET password_hash = ? WHERE id = ?",
    [hash, id]
  );
};

exports.createWithPassword = async (name, email, hash, role = "MEMBER") => {
  const [result] = await pool.execute(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
    [name, email, hash, role]
  );
  return result.insertId;
};
