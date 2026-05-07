const ProjectModel = require("../models/project.model");

exports.getAll = (opts) => ProjectModel.getAll(opts);

exports.getById = async (id) => {
  const project = await ProjectModel.getById(id);
  if (!project) throw Object.assign(new Error("Project not found"), { status: 404 });
  return project;
};

exports.create = (data) => {
  if (!data.customer_id) throw Object.assign(new Error("customer_id is required"), { status: 400 });
  if (!data.type) throw Object.assign(new Error("type is required"), { status: 400 });
  return ProjectModel.create(data);
};

exports.update = async (id, data) => {
  const existing = await ProjectModel.getById(id);
  if (!existing) throw Object.assign(new Error("Project not found"), { status: 404 });
  // status is no longer required — PATCH semantics, only provided fields are updated
  await ProjectModel.update(id, data);
  // B-2: recalc status whenever project fields (especially due_date) change
  await ProjectModel.recalcStatus(id);
};

exports.remove = async (id) => {
  const existing = await ProjectModel.getById(id);
  if (!existing) throw Object.assign(new Error("Project not found"), { status: 404 });
  return ProjectModel.remove(id);
};
