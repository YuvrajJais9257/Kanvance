const CustomerService = require("../services/customer.service");

exports.getAll = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    res.json(await CustomerService.getAll({ page, limit }));
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    res.json(await CustomerService.getById(req.params.id));
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const result = await CustomerService.create(req.body);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    await CustomerService.update(req.params.id, req.body);
    res.json({ updated: true });
  } catch (err) { next(err); }
};
