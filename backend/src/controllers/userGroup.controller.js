/**
 * userGroup.controller.js
 *
 * CRUD for user access groups.
 * All write operations require ADMIN or MASTER_ADMIN.
 */
const UserGroupService = require("../services/userGroup.service");

// GET /api/user-groups
exports.getAll = async (req, res, next) => {
  try {
    res.json(await UserGroupService.getAll());
  } catch (err) { next(err); }
};

// GET /api/user-groups/:id
exports.getById = async (req, res, next) => {
  try {
    res.json(await UserGroupService.getById(req.params.id));
  } catch (err) { next(err); }
};

// GET /api/user-groups/:id/members
exports.getMembers = async (req, res, next) => {
  try {
    res.json(await UserGroupService.getMembers(req.params.id));
  } catch (err) { next(err); }
};

// POST /api/user-groups  (ADMIN only)
exports.create = async (req, res, next) => {
  try {
    const group = await UserGroupService.create(req.body);
    res.status(201).json(group);
  } catch (err) { next(err); }
};

// PATCH /api/user-groups/:id  (ADMIN only)
exports.update = async (req, res, next) => {
  try {
    const group = await UserGroupService.update(req.params.id, req.body);
    res.json(group);
  } catch (err) { next(err); }
};

// DELETE /api/user-groups/:id  (ADMIN only)
exports.remove = async (req, res, next) => {
  try {
    res.json(await UserGroupService.remove(req.params.id));
  } catch (err) { next(err); }
};

// POST /api/user-groups/:id/assign  (ADMIN only)
// Body: { user_id }
exports.assignUser = async (req, res, next) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: "user_id is required" });
    res.json(await UserGroupService.assignUser(user_id, req.params.id));
  } catch (err) { next(err); }
};
