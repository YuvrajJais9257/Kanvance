// services/user.service.js
const UserModel = require("../models/user.model");

exports.createUser = async (data) => {
  return await UserModel.createUser(
    data.full_name,
    data.email,
    data.password
  );
};

exports.getUsers = async () => {
  return await UserModel.getUsers();
};