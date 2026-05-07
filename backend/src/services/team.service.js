const TeamModel = require("../models/team.model");

exports.getAll = () => TeamModel.getAll();

exports.create = ({ name, email }) => {
  if (!name || !name.trim()) throw Object.assign(new Error("name is required"), { status: 400 });
  return TeamModel.create(name.trim(), email ?? null);
};

exports.remove = (id) => TeamModel.remove(id);
