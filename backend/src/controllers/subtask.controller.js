const SubtaskService = require("../services/subtask.service");

// Roles that can assign/reassign subtasks to any user
const ASSIGNERS = ["ADMIN", "LEAD", "MANAGER"];

exports.create = async (req, res, next) => {
  try {
    const result = await SubtaskService.create(req.params.gid, req.body);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const role = req.session.userRole ?? "MEMBER";
    const body = { ...req.body };

    // MEMBER cannot change assignee_id — strip it from the payload
    if (!ASSIGNERS.includes(role) && "assignee_id" in body) {
      delete body.assignee_id;
    }

    await SubtaskService.update(req.params.id, body);
    res.json({ updated: true });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await SubtaskService.remove(req.params.id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
};
