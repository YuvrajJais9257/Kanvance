const GroupModel = require("../models/group.model");

exports.create = (projectId, { name, position }) => {
  if (!name || !name.trim()) throw Object.assign(new Error("name is required"), { status: 400 });
  return GroupModel.create(projectId, name.trim(), position ?? 0);
};

// A-2/B-6 fix: pass only provided fields; position is optional
exports.update = (id, { name, position }) => {
  if (name !== undefined && !name.trim()) throw Object.assign(new Error("name is required"), { status: 400 });
  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (position !== undefined) data.position = position;
  return GroupModel.update(id, data);
};

exports.remove = (id) => GroupModel.remove(id);
