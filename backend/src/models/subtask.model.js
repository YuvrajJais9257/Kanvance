const pool = require("../config/db");

exports.create = async (groupId, name, position) => {
  const [result] = await pool.execute(
    "INSERT INTO subtasks (group_id, name, position) VALUES (?, ?, ?)",
    [groupId, name, position ?? 0]
  );
  return result;
};

exports.update = async (id, data) => {
  const allowed = [
    "name", "status", "due_date", "assignee_id",
    "flag_type", "flag_reason", "flag_waiting_on",
  ];
  const keys = Object.keys(data).filter((k) => allowed.includes(k));
  if (!keys.length) return;

  const setClauses = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => data[k] ?? null);
  values.push(id);

  await pool.execute(
    `UPDATE subtasks SET ${setClauses} WHERE id = ?`,
    values
  );
  // NOTE: task_assignments are managed exclusively through assignment.service.js
  // syncAssignees (called by subtask.service.js update) to avoid duplicate-key
  // errors on the uq_user_subtask constraint. Do NOT insert task_assignments here.
};

exports.remove = async (id) => {
  await pool.execute("DELETE FROM subtasks WHERE id = ?", [id]);
};

exports.getById = async (id) => {
  const [[row]] = await pool.execute(
    "SELECT * FROM subtasks WHERE id = ?",
    [id]
  );
  return row ?? null;
};

// Write audit log entry
exports.log = async (subtaskId, changedBy, fieldName, oldValue, newValue) => {
  await pool.execute(
    `INSERT INTO subtask_log (subtask_id, changed_by, field_name, old_value, new_value)
     VALUES (?, ?, ?, ?, ?)`,
    [subtaskId, changedBy ?? "system", fieldName, oldValue ?? null, newValue ?? null]
  );
};
