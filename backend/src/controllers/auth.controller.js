const bcrypt             = require("bcrypt");
const AuthModel          = require("../models/auth.model");
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
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = await AuthModel.findByEmail(email);
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Store minimal user info in session
    req.session.userId   = user.id;
    req.session.userName = user.name;
    req.session.userRole = user.role;

    // Set status to Active on login (fire-and-forget; never block the login response)
    AvailabilityModel.setStatus(user.id, "Active").catch(console.error);

    res.json({
      id:    user.id,
      name:  user.name,
      email: user.email,
      role:  user.role,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/logout ────────────────────────────────────
exports.logout = (req, res) => {
  // Set status to Offline before destroying the session (fire-and-forget)
  if (req.session && req.session.userId) {
    AvailabilityModel.setStatus(req.session.userId, "Offline").catch(console.error);
  }
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.clearCookie("cyberark.sid");
    res.json({ loggedOut: true });
  });
};

// ── GET /api/auth/me ─────────────────────────────────────────
exports.me = async (req, res, next) => {
  try {
    const user = await AuthModel.findById(req.session.userId);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    res.json(user);
  } catch (err) {
    next(err);
  }
};
