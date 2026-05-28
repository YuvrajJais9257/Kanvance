/**
 * user.controller.js
 *
 * CRUD endpoints for the User Management admin section.
 * All routes require authentication (enforced in server.js).
 * Role checks are applied per-route via requireRole middleware.
 */
const UserService = require("../services/user.service");
const { getEffectiveRole } = require("../middlewares/requireRole");

const ROLE_RANK = { MEMBER: 1, MANAGER: 2, ADMIN: 3, MASTER_ADMIN: 4 };

// GET /api/users?page=&limit=&search=&role=&status=
exports.getAll = async (req, res, next) => {
  try {
    const { page, limit, search, role, status } = req.query;
    const result = await UserService.getAll({ page, limit, search, role, status });
    res.json(result);
  } catch (err) { next(err); }
};

// GET /api/users/:id
exports.getById = async (req, res, next) => {
  try {
    // Below-ADMIN roles can only view their own profile
    const effectiveRole = getEffectiveRole(req.session);
    if ((ROLE_RANK[effectiveRole] ?? 1) < ROLE_RANK.ADMIN && Number(req.params.id) !== Number(req.session.userId)) {
      return res.status(403).json({ error: "Forbidden — you can only view your own profile" });
    }
    res.json(await UserService.getById(req.params.id));
  } catch (err) { next(err); }
};

// POST /api/users  (ADMIN only)
exports.create = async (req, res, next) => {
  try {
    const user = await UserService.create(req.body);
    res.status(201).json(user);
  } catch (err) { next(err); }
};

// PATCH /api/users/:id  (ADMIN full, MANAGER own profile, MEMBER own profile)
exports.update = async (req, res, next) => {
  try {
    const effectiveRole = getEffectiveRole(req.session);
    const isAdmin       = (ROLE_RANK[effectiveRole] ?? 1) >= ROLE_RANK.ADMIN;
    const targetId      = Number(req.params.id);
    const sessionId     = Number(req.session.userId);

    // Non-admins can only edit themselves
    if (!isAdmin && targetId !== sessionId) {
      return res.status(403).json({ error: "Forbidden — you can only edit your own profile" });
    }

    // Only ADMIN (effective) can change role or status
    if (!isAdmin) {
      delete req.body.role;
      delete req.body.status;
    }

    res.json(await UserService.update(targetId, req.body));
  } catch (err) { next(err); }
};

// PATCH /api/users/:id/deactivate  (ADMIN only)
exports.deactivate = async (req, res, next) => {
  try {
    const targetId  = Number(req.params.id);
    const sessionId = Number(req.session.userId);
    if (targetId === sessionId) {
      return res.status(400).json({ error: "You cannot deactivate your own account" });
    }
    res.json(await UserService.deactivate(targetId));
  } catch (err) { next(err); }
};

// DELETE /api/users/:id  (ADMIN only — soft delete)
exports.remove = async (req, res, next) => {
  try {
    const targetId  = Number(req.params.id);
    const sessionId = Number(req.session.userId);
    if (targetId === sessionId) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }
    res.json(await UserService.softDelete(targetId));
  } catch (err) { next(err); }
};
