const ProjectService = require("../services/project.service");
const requireRole    = require("../middlewares/requireRole");

// Only ADMIN can create projects or change the owner (project assignment).
// MANAGER can edit other project fields (name, status, notes, dates) but
// cannot reassign the owner to a different user.
// MEMBER can only edit projects they own (no owner reassignment).

function canModify(req, project) {
  const role = req.session.userRole ?? "MEMBER";
  if (["ADMIN", "LEAD", "MANAGER"].includes(role)) return true;
  return project.owner_id === req.session.userId;
}

// Returns true if the request is attempting to change the owner_id field
function isChangingOwner(req, project) {
  if (!("owner_id" in req.body)) return false;
  const newOwner = req.body.owner_id ? Number(req.body.owner_id) : null;
  const curOwner = project.owner_id ? Number(project.owner_id) : null;
  return newOwner !== curOwner;
}

exports.getAll = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    res.json(await ProjectService.getAll({ page, limit }));
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    res.json(await ProjectService.getById(req.params.id));
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    // Only ADMIN and LEAD can create projects (which includes setting the owner/assignee)
    const role = req.session.userRole ?? "MEMBER";
    if (!["ADMIN", "LEAD"].includes(role)) {
      return res.status(403).json({ error: "Only admins and leads can create projects" });
    }
    const id = await ProjectService.create(req.body);
    res.status(201).json({ id });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const project = await ProjectService.getById(req.params.id);
    if (!canModify(req, project)) {
      return res.status(403).json({ error: "You do not have permission to edit this project" });
    }
    // Only ADMIN and LEAD can reassign the project owner
    const role = req.session.userRole ?? "MEMBER";
    if (!["ADMIN", "LEAD"].includes(role) && isChangingOwner(req, project)) {
      return res.status(403).json({ error: "Only admins and leads can reassign project ownership" });
    }
    await ProjectService.update(req.params.id, req.body);
    res.json({ updated: true });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const project = await ProjectService.getById(req.params.id);
    if (!canModify(req, project)) {
      return res.status(403).json({ error: "You do not have permission to delete this project" });
    }
    await ProjectService.remove(req.params.id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
};
