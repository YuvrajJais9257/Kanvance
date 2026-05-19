/**
 * userGroup.model.js
 *
 * Data layer for user access groups.
 *
 * Groups define privilege tiers:
 *   MASTER_ADMIN  — full access, can appoint other ADMINs, cannot be demoted by anyone
 *   ADMIN         — full access to all features, can manage users/groups
 *   MANAGER       — can create/edit projects, assign tasks, view all assigned projects
 *   MEMBER        — read-only on projects/tasks they are assigned to; no write access
 *
 * Every user must belong to exactly one group.
 */
const pool = require("../config/db");

// ── List all groups ───────────────────────────────────────────
exports.getAll = async () => {
  const [rows] = await pool.execute(
    `SELECT
       ug.id,
       ug.name,
       ug.privilege_level,
       ug.description,
       ug.created_at,
       COUNT(u.id) AS member_count
     FROM user_groups ug
     LEFT JOIN users u ON u.group_id = ug.id AND u.deleted_at IS NULL
     GROUP BY ug.id
     ORDER BY ug.privilege_level DESC, ug.name ASC`
  );
  return rows;
};

// ── Get single group ──────────────────────────────────────────
exports.getById = async (id) => {
  const [[row]] = await pool.execute(
    `SELECT id, name, privilege_level, description, created_at FROM user_groups WHERE id = ?`,
    [id]
  );
  return row ?? null;
};

// ── Get members of a group ────────────────────────────────────
exports.getMembers = async (groupId) => {
  const [rows] = await pool.execute(
    `SELECT id, name, username, email, role, status, last_login_at
     FROM users
     WHERE group_id = ? AND deleted_at IS NULL
     ORDER BY name ASC`,
    [groupId]
  );
  return rows;
};

// ── Create group ──────────────────────────────────────────────
exports.create = async ({ name, privilege_level, description }) => {
  const [result] = await pool.execute(
    `INSERT INTO user_groups (name, privilege_level, description) VALUES (?, ?, ?)`,
    [name, privilege_level ?? "MEMBER", description ?? null]
  );
  return result.insertId;
};

// ── Update group ──────────────────────────────────────────────
exports.update = async (id, { name, privilege_level, description }) => {
  const setClauses = [];
  const values     = [];
  if (name             !== undefined) { setClauses.push("name = ?");             values.push(name); }
  if (privilege_level  !== undefined) { setClauses.push("privilege_level = ?");  values.push(privilege_level); }
  if (description      !== undefined) { setClauses.push("description = ?");      values.push(description ?? null); }
  if (!setClauses.length) return;
  values.push(id);
  await pool.execute(`UPDATE user_groups SET ${setClauses.join(", ")} WHERE id = ?`, values);
};

// ── Delete group (only if no members) ────────────────────────
exports.remove = async (id) => {
  const [[{ cnt }]] = await pool.execute(
    "SELECT COUNT(*) AS cnt FROM users WHERE group_id = ? AND deleted_at IS NULL",
    [id]
  );
  if (cnt > 0) {
    const err = new Error(`Cannot delete group — ${cnt} user(s) still belong to it. Reassign them first.`);
    err.status = 409;
    throw err;
  }
  await pool.execute("DELETE FROM user_groups WHERE id = ?", [id]);
};

// ── Assign user to group ──────────────────────────────────────
exports.assignUser = async (userId, groupId) => {
  await pool.execute(
    "UPDATE users SET group_id = ? WHERE id = ? AND deleted_at IS NULL",
    [groupId, userId]
  );
};

// ── Check if group name exists ────────────────────────────────
exports.nameExists = async (name, excludeId = null) => {
  const sql    = excludeId
    ? "SELECT id FROM user_groups WHERE name = ? AND id != ?"
    : "SELECT id FROM user_groups WHERE name = ?";
  const params = excludeId ? [name, excludeId] : [name];
  const [[row]] = await pool.execute(sql, params);
  return !!row;
};
