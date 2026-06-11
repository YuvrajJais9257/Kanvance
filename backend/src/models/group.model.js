const pool = require("../config/db");

exports.getById = async (id) => {
  const [[group]] = await pool.execute(
    `SELECT
       ag.id,
       ag.project_id,
       ag.name,
       ag.position,
       ag.estimated_hours,
       ag.assignee_id,
       (SELECT ROUND(COALESCE(SUM(te.hours_logged), 0), 2)
        FROM timesheet_entries te
        JOIN subtasks s2 ON s2.id = te.subtask_id
        WHERE s2.group_id = ag.id) AS actual_hours_logged,
       (SELECT ROUND(COALESCE(SUM(te.hours_logged), 0) - COALESCE(ag.estimated_hours, 0), 2)
        FROM timesheet_entries te
        JOIN subtasks s2 ON s2.id = te.subtask_id
        WHERE s2.group_id = ag.id) AS variance
     FROM activity_groups ag
     WHERE ag.id = ?`,
    [id]
  );
  return group ?? null;
};

exports.create = async (projectId, name, position) => {
  const [result] = await pool.execute(
    "INSERT INTO activity_groups (project_id, name, position) VALUES (?, ?, ?)",
    [projectId, name, position ?? 0]
  );
  return result;
};

// A-2 / B-6 fix: only update fields that are provided
// Requirement 4.1: extended to support assignee_id column (task-level assignment)
exports.update = async (id, data) => {
  const setClauses = [];
  const values = [];

  if ("name" in data && data.name != null) {
    setClauses.push("name = ?");
    values.push(data.name);
  }
  if ("position" in data && data.position != null) {
    setClauses.push("position = ?");
    values.push(data.position);
  }
  // assignee_id is nullable — allow explicit null to clear the assignment
  if ("assignee_id" in data) {
    setClauses.push("assignee_id = ?");
    values.push(data.assignee_id ?? null);
  }

  if (!setClauses.length) return;
  values.push(id);
  await pool.execute(
    `UPDATE activity_groups SET ${setClauses.join(", ")} WHERE id = ?`,
    values
  );
};

exports.remove = async (id) => {
  // Get subtask ids before deleting (for orphan link cleanup)
  const [subtaskRows] = await pool.execute(
    "SELECT id FROM subtasks WHERE group_id = ?",
    [id]
  );
  const subtaskIds = subtaskRows.map((r) => r.id);

  // Clean up orphan document/infra links for all subtasks in this group
  if (subtaskIds.length) {
    const ph = subtaskIds.map(() => "?").join(",");
    await pool.execute(`DELETE FROM document_links WHERE entity_type = 'subtask' AND entity_id IN (${ph})`, subtaskIds);
    await pool.execute(`DELETE FROM infra_links WHERE entity_type = 'subtask' AND entity_id IN (${ph})`, subtaskIds);
  }

  // Clean up group-level links
  await pool.execute("DELETE FROM document_links WHERE entity_type = 'group' AND entity_id = ?", [id]);
  await pool.execute("DELETE FROM infra_links WHERE entity_type = 'group' AND entity_id = ?", [id]);

  const cnt = subtaskIds.length;
  await pool.execute("DELETE FROM activity_groups WHERE id = ?", [id]);
  return cnt;
};
