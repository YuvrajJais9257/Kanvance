const bcrypt             = require("bcrypt");
const pool               = require("../config/db");
const AuthModel          = require("../models/auth.model");
const UserModel          = require("../models/user.model");
const AvailabilityModel  = require("../models/availability.model");

const SALT_ROUNDS = 12;

// ── POST /api/auth/register ──────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email and password are required" });
    }

    // Check duplicate email
    const existing = await AuthModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const id   = await AuthModel.createWithPassword(name.trim(), email.trim(), hash, role ?? "MEMBER");

    res.status(201).json({ id, name: name.trim(), email: email.trim() });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/login ─────────────────────────────────────
// Accepts: { email, password }  OR  { username, password }
exports.login = async (req, res, next) => {
  try {
    const { email, username, password } = req.body;
    const identifier = email || username;

    if (!identifier || !password) {
      return res.status(400).json({ error: "email (or username) and password are required" });
    }

    // Look up by email first, then by username
    let user = null;
    if (email) {
      user = await UserModel.findByEmail(email.trim().toLowerCase());
    } else {
      user = await UserModel.findByUsername(username.trim().toLowerCase());
    }

    if (!user || !user.password_hash) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Verify password
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Enforce account status — inactive/disabled users cannot log in
    if (user.status === "inactive") {
      return res.status(403).json({ error: "Account is inactive. Contact an administrator." });
    }
    if (user.status === "disabled") {
      return res.status(403).json({ error: "Account has been disabled. Contact an administrator." });
    }

    // Store minimal user info in session
    req.session.userId      = user.id;
    req.session.userName    = user.name;
    req.session.userRole    = user.role;
    req.session.roleVersion = user.role_version ?? 1;

    // Get user's group privilege level
    let privilegeLevel = "MEMBER"; // default
    if (user.group_id) {
      const [[group]] = await pool.execute(
        "SELECT privilege_level FROM user_groups WHERE id = ?",
        [user.group_id]
      );
      if (group) privilegeLevel = group.privilege_level;
    }
    req.session.privilegeLevel = privilegeLevel;

    // Fire-and-forget side effects — never block the login response
    UserModel.touchLastLogin(user.id).catch(console.error);
    AvailabilityModel.setStatus(user.id, "Active").catch(console.error);

    res.json({
      id:       user.id,
      name:     user.name,
      username: user.username ?? null,
      email:    user.email,
      role:     user.role,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/logout ────────────────────────────────────
exports.logout = (req, res) => {
  if (req.session && req.session.userId) {
    AvailabilityModel.setStatus(req.session.userId, "Offline").catch(console.error);
  }
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.clearCookie("eradesk.sid");
    res.json({ loggedOut: true });
  });
};

// ── GET /api/auth/me ─────────────────────────────────────────
exports.me = async (req, res, next) => {
  try {
    const user = await UserModel.getById(req.session.userId);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    res.json(user);
  } catch (err) {
    next(err);
  }
};
