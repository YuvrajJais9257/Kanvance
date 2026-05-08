/**
 * user.service.js
 *
 * Business logic for user CRUD.
 * Handles validation, uniqueness checks, and password hashing.
 * Never returns password_hash.
 */
const bcrypt    = require("bcrypt");
const UserModel = require("../models/user.model");

const SALT_ROUNDS   = 12;
const VALID_ROLES   = ["ADMIN", "MANAGER", "MEMBER"];
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
exports.create = async ({ name, username, full_name, email, password, role, status }) => {
  if (!name || !name.trim())     throw bad("name is required");
  if (!email || !email.trim())   throw bad("email is required");
  if (!password)                 throw bad("password is required");
  if (!validateEmail(email))     throw bad("Invalid email format");
  if (!validatePassword(password)) throw bad("Password must be at least 8 characters and contain a letter and a number");
  if (role && !VALID_ROLES.includes(role))     throw bad(`role must be one of: ${VALID_ROLES.join(", ")}`);
  if (status && !VALID_STATUSES.includes(status)) throw bad(`status must be one of: ${VALID_STATUSES.join(", ")}`);

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
    role:          role ?? "MEMBER",
    status:        status ?? "active",
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
  if (data.role !== undefined) {
    if (!VALID_ROLES.includes(data.role)) throw bad(`role must be one of: ${VALID_ROLES.join(", ")}`);
    patch.role = data.role;
  }
  if (data.status !== undefined) {
    if (!VALID_STATUSES.includes(data.status)) throw bad(`status must be one of: ${VALID_STATUSES.join(", ")}`);
    patch.status = data.status;
  }
  if (data.password !== undefined) {
    if (!validatePassword(data.password)) throw bad("Password must be at least 8 characters and contain a letter and a number");
    patch.password_hash = await bcrypt.hash(data.password, SALT_ROUNDS);
  }

  await UserModel.update(id, patch);
  return UserModel.getById(id);
};

// ── Deactivate (soft status change) ──────────────────────────
exports.deactivate = async (id) => {
  const existing = await UserModel.getById(id);
  if (!existing) throw notFound();
  await UserModel.update(id, { status: "inactive" });
  return UserModel.getById(id);
};

// ── Soft delete ───────────────────────────────────────────────
exports.softDelete = async (id) => {
  const existing = await UserModel.getById(id);
  if (!existing) throw notFound();
  await UserModel.softDelete(id);
  return { deleted: true, id: Number(id) };
};
