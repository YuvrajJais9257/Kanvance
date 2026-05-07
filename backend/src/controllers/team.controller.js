const TeamService = require("../services/team.service");

exports.getAll = async (req, res, next) => {
  try {
    res.json(await TeamService.getAll());
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const result = await TeamService.create(req.body);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await TeamService.remove(req.params.id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
};
