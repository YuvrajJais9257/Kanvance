const pool = require("../config/db");

exports.findByEmail = async (email) => {
  const [[row]] = await pool.execute(
    "SELECT id, name, email, password_hash, role FROM users WHERE email = ?",
    [email]
  );
  return row ?? null;
};

exports.findById = async (id) => {
  const [[row]] = await pool.execute(
    "SELECT id, name, email, role FROM users WHERE id = ?",
    [id]
  );
  return row ?? null;
};

exports.setPassword = async (id, hash) => {
  await pool.execute(
    "UPDATE users SET password_hash = ? WHERE id = ?",
    [hash, id]
  );
};

exports.createWithPassword = async (name, email, hash, role = "MEMBER") => {
  const [result] = await pool.execute(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
    [name, email, hash, role]
  );
  return result.insertId;
};
