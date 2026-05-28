/**
 * user.service.js
 *
 * Business logic for user CRUD.
 * Handles validation, uniqueness checks, and password hashing.
 * Never returns password_hash.
 *
 * Role is derived from the user's group (privilege_level) and is not
 * settable directly — use group assignment to change a user's access level.
 */
const bcrypt         = require("bcrypt");
const UserModel      = require("../models/user.model");
const UserGroupModel = require("../models/userGroup.model");

// Fields that affect session privileges — changing either one bumps role_version
const PRIVILEGE_FIELDS = new Set(["role", "status"]);

const SALT_ROUNDS    = 12;
const VALID_STATUSES = ["active", "inactive", "disabled"];

// ── Helpers ───────────────────────────────────────────────────
function bad(msg)  { return Object.assign(new Error(msg), { status: 400 }); }
function notFound(){ return Object.assign(new Error("User not found"),    { status: 404 }); }

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  // Min 8 chars, at least one letter and one number
  return typeof password === "string" && password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

// ── List ──────────────────────────────────────────────────────
exports.getAll = (opts) => UserModel.getAll(opts);

// ── Get single ────────────────────────────────────────────────
exports.getById = async (id) => {
  const user = await UserModel.getById(id);
  if (!user) throw notFound();
  return user;
};

// ── Create ────────────────────────────────────────────────────
exports.create = async ({ name, username, full_name, email, password, status, group_id }) => {
  if (!name || !name.trim())     throw bad("name is required");
  if (!email || !email.trim())   throw bad("email is required");
  if (!password)                 throw bad("password is required");
  if (!group_id)                 throw bad("group_id is required — every user must belong to a group");
  if (!validateEmail(email))     throw bad("Invalid email format");
  if (!validatePassword(password)) throw bad("Password must be at least 8 characters and contain a letter and a number");
  if (status && !VALID_STATUSES.includes(status)) throw bad(`status must be one of: ${VALID_STATUSES.join(", ")}`);

  // Derive role from the group — group is the single source of truth
  const group = await UserGroupModel.getById(group_id);
  if (!group) throw Object.assign(new Error("Group not found"), { status: 404 });
  const role = group.privilege_level;

  // Uniqueness checks
  if (await UserModel.emailExists(email)) {
    throw Object.assign(new Error("Email already in use"), { status: 409 });
  }
  if (username) {
    if (await UserModel.usernameExists(username)) {
      throw Object.assign(new Error("Username already taken"), { status: 409 });
    }
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const id = await UserModel.create({
    name:          name.trim(),
    username:      username?.trim().toLowerCase() ?? null,
    full_name:     full_name?.trim() ?? null,
    email:         email.trim().toLowerCase(),
    password_hash,
    role,
    status:        status ?? "active",
    group_id,
  });

  return UserModel.getById(id);
};

// ── Update ────────────────────────────────────────────────────
exports.update = async (id, data) => {
  const existing = await UserModel.getById(id);
  if (!existing) throw notFound();

  const patch = {};

  if (data.name !== undefined) {
    if (!data.name.trim()) throw bad("name cannot be empty");
    patch.name = data.name.trim();
  }
  if (data.username !== undefined) {
    const uname = data.username.trim().toLowerCase();
    if (await UserModel.usernameExists(uname, id)) {
      throw Object.assign(new Error("Username already taken"), { status: 409 });
    }
    patch.username = uname;
  }
  if (data.full_name !== undefined) patch.full_name = data.full_name?.trim() ?? null;
  if (data.email !== undefined) {
    if (!validateEmail(data.email)) throw bad("Invalid email format");
    if (await UserModel.emailExists(data.email, id)) {
      throw Object.assign(new Error("Email already in use"), { status: 409 });
    }
    patch.email = data.email.trim().toLowerCase();
  }
  // role is intentionally not updatable here — it is derived from group assignment.
  // To change a user's access level, reassign them to a different group.
  if (data.status !== undefined) {
    if (!VALID_STATUSES.includes(data.status)) throw bad(`status must be one of: ${VALID_STATUSES.join(", ")}`);
    patch.status = data.status;
  }
  if (data.password !== undefined) {
    if (!validatePassword(data.password)) throw bad("Password must be at least 8 characters and contain a letter and a number");
    patch.password_hash = await bcrypt.hash(data.password, SALT_ROUNDS);
  }

  await UserModel.update(id, patch);

  // If role or status changed, bump role_version so active sessions are
  // invalidated on their next request (instant privilege revocation).
  const privilegeChanged = Object.keys(patch).some((k) => PRIVILEGE_FIELDS.has(k));
  if (privilegeChanged) {
    await UserModel.bumpRoleVersion(id);
  }

  return UserModel.getById(id);
};

// ── Deactivate (soft status change) ──────────────────────────
exports.deactivate = async (id) => {
  const existing = await UserModel.getById(id);
  if (!existing) throw notFound();
  await UserModel.update(id, { status: "inactive" });
  // Status change — invalidate active sessions immediately
  await UserModel.bumpRoleVersion(id);
  return UserModel.getById(id);
};

// ── Soft delete ───────────────────────────────────────────────
exports.softDelete = async (id) => {
  const existing = await UserModel.getById(id);
  if (!existing) throw notFound();
  // Soft-delete the user (sets deleted_at + status=disabled).
  // This automatically removes them from the team list (team query filters deleted/disabled).
  // Also nullify assignee_id on any open subtasks so no orphan references remain.
  await UserModel.softDelete(id);
  await UserModel.unassignOpenSubtasks(id);
  return { deleted: true, id: Number(id) };
};
