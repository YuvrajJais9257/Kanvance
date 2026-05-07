const SubtaskService = require("../services/subtask.service");

exports.create = async (req, res, next) => {
  try {
    const result = await SubtaskService.create(req.params.gid, req.body);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    await SubtaskService.update(req.params.id, req.body);
    res.json({ updated: true });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await SubtaskService.remove(req.params.id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
};
