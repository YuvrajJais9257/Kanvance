const pool = require("../config/db");
const SubtaskModel = require("../models/subtask.model");
const ProjectModel = require("../models/project.model");
const TimeLogModel = require("../models/timeLog.model");

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

  // ── Auto-log hours when subtask is marked Done ────────────────────────
  // Only fires when transitioning TO "Done" (not if it was already Done).
  if (cleanData.status === "Done" && existing.status !== "Done") {
    try {
      // Resolve the assignee: use the updated assignee_id if provided, else the existing one
      const assigneeId = cleanData.assignee_id ?? existing.assignee_id;
      if (assigneeId) {
        // Fetch project + activity_group names for the natural key
        const [[ctx]] = await pool.execute(
          `SELECT p.name AS project_name, ag.name AS activity_group
           FROM activity_groups ag
           JOIN projects p ON p.id = ag.project_id
           WHERE ag.id = ?`,
          [existing.group_id]
        );
        if (ctx) {
          await TimeLogModel.insertAppLog({
            employee_id:    assigneeId,
            project_name:   ctx.project_name,
            activity_group: ctx.activity_group,
            date:           new Date().toISOString().split("T")[0],
            hours:          1, // default 1h per subtask completion
          });
        }
      }
    } catch (logErr) {
      // Non-fatal — log the error but don't fail the subtask update
      console.error("[time_logs] Failed to auto-log hours for subtask", id, logErr.message);
    }
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
