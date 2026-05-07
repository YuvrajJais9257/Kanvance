const pool = require("../config/db");
const SubtaskModel = require("../models/subtask.model");
const ProjectModel = require("../models/project.model");

exports.create = (groupId, { name, position }) => {
  if (!name || !name.trim()) throw Object.assign(new Error("name is required"), { status: 400 });
  return SubtaskModel.create(groupId, name.trim(), position ?? 0);
};

exports.update = async (id, data) => {
  // P-1 fix: single query fetches subtask + project_id in one round-trip
  const [[existing]] = await pool.execute(
    `SELECT s.*, ag.project_id
     FROM subtasks s
     JOIN activity_groups ag ON ag.id = s.group_id
     WHERE s.id = ?`,
    [id]
  );
  if (!existing) throw Object.assign(new Error("Subtask not found"), { status: 404 });

  // Write audit log for tracked fields
  const tracked = ["status", "assignee_id", "flag_type", "flag_reason"];
  for (const field of tracked) {
    if (field in data && String(data[field]) !== String(existing[field] ?? "")) {
      await SubtaskModel.log(id, data._changedBy, field, existing[field], data[field]);
    }
  }

  const { _changedBy, ...cleanData } = data;
  await SubtaskModel.update(id, cleanData);

  // Auto-derive project status whenever a subtask status changes
  if ("status" in cleanData) {
    await ProjectModel.recalcStatus(existing.project_id);
  }
};

exports.remove = async (id) => {
  // P-1 fix: single query fetches subtask + project_id
  const [[existing]] = await pool.execute(
    `SELECT s.id, ag.project_id
     FROM subtasks s
     JOIN activity_groups ag ON ag.id = s.group_id
     WHERE s.id = ?`,
    [id]
  );
  if (!existing) throw Object.assign(new Error("Subtask not found"), { status: 404 });

  // Clean up orphan document/infra links for this subtask
  await pool.execute("DELETE FROM document_links WHERE entity_type = 'subtask' AND entity_id = ?", [id]);
  await pool.execute("DELETE FROM infra_links WHERE entity_type = 'subtask' AND entity_id = ?", [id]);

  await SubtaskModel.remove(id);

  // Recalc project status after deletion
  await ProjectModel.recalcStatus(existing.project_id);
};
