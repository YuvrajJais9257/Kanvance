const ContactModel = require("../models/contact.model");

exports.getByCustomer = (customerId) => ContactModel.getByCustomer(customerId);

exports.create = (customerId, data) => {
  if (!data.name || !data.name.trim())
    throw Object.assign(new Error("name is required"), { status: 400 });
  return ContactModel.create(customerId, data);
};

exports.remove = (id) => ContactModel.remove(id);
