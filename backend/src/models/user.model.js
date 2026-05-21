/**
 * user.model.js
 *
 * Full CRUD data layer for the users/assignees table.
 * Never returns password_hash — all selects explicitly list safe columns.
 */
const pool = require("../config/db");

// Safe columns returned in every list/get response
const SAFE_COLS = `
  u.id, u.name, u.username, u.full_name, u.email, u.role, u.status,
  u.availability, u.last_login_at, u.created_at, u.updated_at,
  u.group_id, ug.name AS group_name, ug.privilege_level AS group_privilege_level
`;

// ── List users (paginated + filterable) ──────────────────────
exports.getAll = async ({ page = 1, limit = 50, search = "", role = "", status = "" } = {}) => {
  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const offset   = (pageNum - 1) * limitNum;

  const conditions = ["u.deleted_at IS NULL"];
  const params     = [];

  if (search) {
    conditions.push("(u.name LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR u.full_name LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (role)   { conditions.push("u.role = ?");   params.push(role); }
  if (status) { conditions.push("u.status = ?"); params.push(status); }

  const where = conditions.join(" AND ");

  // Total count for pagination metadata
  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM users u WHERE ${where}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT ${SAFE_COLS}
     FROM users u
     LEFT JOIN user_groups ug ON ug.id = u.group_id
     WHERE ${where}
     ORDER BY u.name ASC
     LIMIT ${limitNum} OFFSET ${offset}`,
    params
  );

  return { data: rows, total: Number(total), page: pageNum, limit: limitNum };
};

// ── Get single user by id ────────────────────────────────────
exports.getById = async (id) => {
  const [[row]] = await pool.execute(
    `SELECT ${SAFE_COLS}
     FROM users u
     LEFT JOIN user_groups ug ON ug.id = u.group_id
     WHERE u.id = ? AND u.deleted_at IS NULL`,
    [id]
  );
  return row ?? null;
};

// ── Get by email (for auth — includes password_hash) ─────────
exports.findByEmail = async (email) => {
  const [[row]] = await pool.execute(
    "SELECT id, name, username, email, password_hash, role, status, group_id FROM users WHERE email = ? AND deleted_at IS NULL",
    [email]
  );
  return row ?? null;
};

// ── Get by username (for username-based login) ────────────────
exports.findByUsername = async (username) => {
  const [[row]] = await pool.execute(
    "SELECT id, name, username, email, password_hash, role, status, group_id FROM users WHERE username = ? AND deleted_at IS NULL",
    [username]
  );
  return row ?? null;
};

// ── Check uniqueness helpers ──────────────────────────────────
// Uses the virtual columns (email_active / username_active) which are NULL
// for soft-deleted rows — so deleted users never block reuse of their email/username.
exports.emailExists = async (email, excludeId = null) => {
  const sql = excludeId
    ? "SELECT id FROM users WHERE email_active = ? AND id != ?"
    : "SELECT id FROM users WHERE email_active = ?";
  const params = excludeId ? [email, excludeId] : [email];
  const [[row]] = await pool.execute(sql, params);
  return !!row;
};

exports.usernameExists = async (username, excludeId = null) => {
  const sql = excludeId
    ? "SELECT id FROM users WHERE username_active = ? AND id != ?"
    : "SELECT id FROM users WHERE username_active = ?";
  const params = excludeId ? [username, excludeId] : [username];
  const [[row]] = await pool.execute(sql, params);
  return !!row;
};

// ── Create user ───────────────────────────────────────────────
exports.create = async ({ name, username, full_name, email, password_hash, role = "MEMBER", status = "active", group_id = null }) => {
  const [result] = await pool.execute(
    `INSERT INTO users (name, username, full_name, email, password_hash, role, status, group_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, username ?? null, full_name ?? null, email ?? null, password_hash ?? null, role, status, group_id]
  );
  return result.insertId;
};

// ── Update user (PATCH semantics — only provided fields) ──────
exports.update = async (id, data) => {
  const allowed = ["name", "username", "full_name", "email", "role", "status", "password_hash"];
  const keys    = Object.keys(data).filter((k) => allowed.includes(k));
  if (!keys.length) return;

  const setClauses = keys.map((k) => `${k} = ?`).join(", ");
  const values     = keys.map((k) => data[k] ?? null);
  values.push(id);

  await pool.execute(
    `UPDATE users SET ${setClauses} WHERE id = ? AND deleted_at IS NULL`,
    values
  );
};

// ── Soft delete ───────────────────────────────────────────────
exports.softDelete = async (id) => {
  await pool.execute(
    "UPDATE users SET deleted_at = NOW(), status = 'disabled' WHERE id = ?",
    [id]
  );
};

// ── Nullify assignee_id on open subtasks for a deleted user ──
exports.unassignOpenSubtasks = async (id) => {
  await pool.execute(
    "UPDATE subtasks SET assignee_id = NULL WHERE assignee_id = ? AND status != 'Done'",
    [id]
  );
};

// ── Hard delete (admin only, use with caution) ────────────────
exports.hardDelete = async (id) => {
  // Check for open subtasks first
  const [[{ cnt }]] = await pool.execute(
    "SELECT COUNT(*) AS cnt FROM subtasks WHERE assignee_id = ? AND status != 'Done'",
    [id]
  );
  if (cnt > 0) {
    const err = new Error(`User has ${cnt} open task(s). Reassign before deleting.`);
    err.status = 409;
    throw err;
  }
  await pool.execute("DELETE FROM users WHERE id = ?", [id]);
};

// ── Record last login timestamp ───────────────────────────────
exports.touchLastLogin = async (id) => {
  await pool.execute(
    "UPDATE users SET last_login_at = NOW() WHERE id = ?",
    [id]
  );
};
