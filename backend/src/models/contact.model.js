const pool = require("../config/db");

exports.getByCustomer = async (customerId) => {
  const [rows] = await pool.execute(
    "SELECT * FROM contacts WHERE customer_id = ? ORDER BY name",
    [customerId]
  );
  return rows;
};

exports.create = async (customerId, data) => {
  const { name, role, department, email, phone, notes } = data;
  const [result] = await pool.execute(
    `INSERT INTO contacts (customer_id, name, role, department, email, phone, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      customerId, name,
      role ?? null, department ?? null,
      email ?? null, phone ?? null, notes ?? null,
    ]
  );
  return result;
};

exports.remove = async (id) => {
  await pool.execute("DELETE FROM contacts WHERE id = ?", [id]);
};
