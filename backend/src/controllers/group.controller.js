const GroupService = require("../services/group.service");

exports.create = async (req, res, next) => {
  try {
    const result = await GroupService.create(req.params.pid, req.body);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    await GroupService.update(req.params.id, req.body);
    res.json({ updated: true });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const subtasksDeleted = await GroupService.remove(req.params.id);
    res.json({ deleted: true, subtasks_deleted: subtasksDeleted });
  } catch (err) { next(err); }
};
