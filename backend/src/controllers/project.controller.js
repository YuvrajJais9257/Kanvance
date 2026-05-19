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
    const role   = req.session.userRole ?? "MEMBER";
    const userId = req.session.userId;

    // ADMIN sees all projects; everyone else only sees projects they own
    // or have at least one subtask assigned to them in.
    if (role === "ADMIN") {
      res.json(await ProjectService.getAll({ page, limit }));
    } else {
      res.json(await ProjectService.getAllForUser({ page, limit }, userId));
    }
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    const project = await ProjectService.getById(req.params.id);
    const role    = req.session.userRole ?? "MEMBER";
    const userId  = req.session.userId;

    // Non-admins can only view projects they own or are assigned to
    if (role !== "ADMIN") {
      const isOwner    = project.owner_id === userId;
      const [assigned] = await require("../config/db").execute(
        `SELECT 1 FROM subtasks s
         JOIN activity_groups ag ON ag.id = s.group_id
         WHERE ag.project_id = ? AND s.assignee_id = ? LIMIT 1`,
        [project.id, userId]
      );
      if (!isOwner && assigned.length === 0) {
        return res.status(403).json({ error: "You do not have access to this project" });
      }
    }

    res.json(project);
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
