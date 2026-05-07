const CustomerModel = require("../models/customer.model");

exports.getAll = (opts) => CustomerModel.getAll(opts);

exports.getById = async (id) => {
  const customer = await CustomerModel.getById(id);
  if (!customer) throw Object.assign(new Error("Customer not found"), { status: 404 });
  return customer;
};

exports.create = (data) => {
  if (!data.name || !data.name.trim())
    throw Object.assign(new Error("name is required"), { status: 400 });
  return CustomerModel.create(data);
};

exports.update = async (id, data) => {
  const existing = await CustomerModel.getById(id);
  if (!existing) throw Object.assign(new Error("Customer not found"), { status: 404 });
  return CustomerModel.update(id, data);
};
