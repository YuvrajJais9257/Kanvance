const pool = require("../config/db");

exports.getAll = async () => {
  const [rows] = await pool.execute(
    "SELECT id, name, email, created_at FROM users ORDER BY name"
  );
  return rows;
};

exports.create = async (name, email) => {
  const [result] = await pool.execute(
    "INSERT INTO users (name, email) VALUES (?, ?)",
    [name, email ?? null]
  );
  return result;
};

exports.remove = async (id) => {
  // Check for open subtasks assigned to this member
  const [open] = await pool.execute(
    "SELECT COUNT(*) AS cnt FROM subtasks WHERE assignee_id = ? AND status != 'Done'",
    [id]
  );
  if (open[0].cnt > 0) {
    const err = new Error(
      `This person is assigned to ${open[0].cnt} open task(s). Reassign them before removing.`
    );
    err.status = 409;
    throw err;
  }
  await pool.execute("DELETE FROM users WHERE id = ?", [id]);
};
