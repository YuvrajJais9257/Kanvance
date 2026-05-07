const ProjectService = require("../services/project.service");

// S-5: helper — ADMIN and MANAGER can do anything; MEMBER can only touch their own projects
function canModify(req, project) {
  const role = req.session.userRole ?? "MEMBER";
  if (["ADMIN", "MANAGER"].includes(role)) return true;
  return project.owner_id === req.session.userId;
}

exports.getAll = async (req, res, next) => {
  try {
    // P-4: optional pagination via ?page=&limit=
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
