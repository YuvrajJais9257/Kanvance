/**
 * user.controller.js
 *
 * CRUD endpoints for the User Management admin section.
 * All routes require authentication (enforced in server.js).
 * Role checks are applied per-route via requireRole middleware.
 */
const UserService = require("../services/user.service");

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
    // MEMBER can only view their own profile; ADMIN/LEAD/MANAGER can view any
    const role = req.session.userRole ?? "MEMBER";
    if (role === "MEMBER" && Number(req.params.id) !== Number(req.session.userId)) {
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
    const role      = req.session.userRole ?? "MEMBER";
    const targetId  = Number(req.params.id);
    const sessionId = Number(req.session.userId);

    // Non-admins can only edit themselves
    if (role !== "ADMIN" && targetId !== sessionId) {
      return res.status(403).json({ error: "Forbidden — you can only edit your own profile" });
    }

    // Only ADMIN can change role or status
    if (role !== "ADMIN") {
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
