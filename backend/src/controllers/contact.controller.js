const ContactService = require("../services/contact.service");

exports.getByCustomer = async (req, res, next) => {
  try {
    res.json(await ContactService.getByCustomer(req.params.id));
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const result = await ContactService.create(req.params.id, req.body);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await ContactService.remove(req.params.id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
};
