const InfraModel = require("../models/infra.model");

exports.getByCustomer = (customerId) => InfraModel.getByCustomer(customerId);

exports.getByEntity = (entityType, entityId) =>
  InfraModel.getByEntity(entityType, entityId);

exports.getPickerInfra = (customerId) => InfraModel.getPickerInfra(customerId);

exports.create = (customerId, data) => {
  if (!data.hostname || !data.hostname.trim())
    throw Object.assign(new Error("hostname is required"), { status: 400 });
  return InfraModel.create(customerId, data);
};

exports.link = (infraId, entityType, entityId) =>
  InfraModel.link(infraId, entityType, entityId);

exports.unlink = (infraId, entityType, entityId) =>
  InfraModel.unlink(infraId, entityType, entityId);

exports.remove = (id) => InfraModel.remove(id);
