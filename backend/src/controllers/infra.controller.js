const InfraService = require("../services/infra.service");

exports.getByCustomer = async (req, res, next) => {
  try {
    res.json(await InfraService.getByCustomer(req.params.id));
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const result = await InfraService.create(req.params.id, req.body);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await InfraService.remove(req.params.id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
};

// GET /api/infra/entity/:type/:id — infra linked to project/group/subtask (with inheritance)
exports.getByEntity = async (req, res, next) => {
  try {
    const { type, id } = req.params;
    if (!["project", "group", "subtask"].includes(type)) {
      return res.status(400).json({ error: "entity type must be project, group, or subtask" });
    }
    res.json(await InfraService.getByEntity(type, id));
  } catch (err) { next(err); }
};

// GET /api/infra/picker/:customerId — all infra for a customer (for the attach picker)
exports.getPicker = async (req, res, next) => {
  try {
    res.json(await InfraService.getPickerInfra(req.params.customerId));
  } catch (err) { next(err); }
};

// POST /api/infra/link — { infra_id, entity_type, entity_id }
exports.linkInfra = async (req, res, next) => {
  try {
    const { infra_id, entity_type, entity_id } = req.body;
    if (!infra_id || !entity_type || !entity_id) {
      return res.status(400).json({ error: "infra_id, entity_type, entity_id are required" });
    }
    if (!["project", "group", "subtask"].includes(entity_type)) {
      return res.status(400).json({ error: "entity_type must be project, group, or subtask" });
    }
    // A-4: validate ids are positive integers
    const iId  = parseInt(infra_id, 10);
    const eId  = parseInt(entity_id, 10);
    if (!iId || iId <= 0 || !eId || eId <= 0) {
      return res.status(400).json({ error: "infra_id and entity_id must be positive integers" });
    }
    await InfraService.link(iId, entity_type, eId);
    res.status(201).json({ linked: true });
  } catch (err) { next(err); }
};

// POST /api/infra/unlink  (A-3: was DELETE with body — changed to POST for proxy compatibility)
exports.unlinkInfra = async (req, res, next) => {
  try {
    const { infra_id, entity_type, entity_id } = req.body;
    if (!infra_id || !entity_type || !entity_id) {
      return res.status(400).json({ error: "infra_id, entity_type, entity_id are required" });
    }
    const iId = parseInt(infra_id, 10);
    const eId = parseInt(entity_id, 10);
    if (!iId || iId <= 0 || !eId || eId <= 0) {
      return res.status(400).json({ error: "infra_id and entity_id must be positive integers" });
    }
    await InfraService.unlink(iId, entity_type, eId);
    res.json({ unlinked: true });
  } catch (err) { next(err); }
};
