// models/user.model.js
const pool = require("../config/db");

exports.createUser = async (full_name, email, password) => {
  const [result] = await pool.execute(
    "INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)",
    [full_name, email, password]
  );
  return result;
};

exports.getUsers = async () => {
  const [rows] = await pool.execute("SELECT * FROM users");
  return rows;
};