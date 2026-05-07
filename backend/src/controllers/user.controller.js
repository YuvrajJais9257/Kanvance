// controllers/user.controller.js
const UserService = require("../services/user.service");

exports.createUser = async (req, res) => {
  try {
    const result = await UserService.createUser(req.body);
    res.json({ message: "User created", id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const users = await UserService.getUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};