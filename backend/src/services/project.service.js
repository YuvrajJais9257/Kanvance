const ProjectModel = require("../models/project.model");
const pool = require("../config/db");

exports.getAll = (opts) => ProjectModel.getAll(opts);

exports.getAllForUser = (opts, userId) =>
  ProjectModel.getAllForUser(opts, userId);

exports.getById = async (id) => {
  const project = await ProjectModel.getById(id);
  if (!project)
    throw Object.assign(new Error("Project not found"), { status: 404 });
  return project;
};

exports.create = async (data) => {
  if (!data.customer_id)
    throw Object.assign(new Error("customer_id is required"), { status: 400 });
  if (!data.type)
    throw Object.assign(new Error("type is required"), { status: 400 });

  // Extract initial_member_ids from data (multi-user assignment)
  const initialMemberIds = data.initial_member_ids
    ? Array.isArray(data.initial_member_ids)
      ? data.initial_member_ids
      : [data.initial_member_ids]
    : [];

  // Remove initial_member_ids from data before passing to ProjectModel.create
  const projectData = { ...data };
  delete projectData.initial_member_ids;

  // Create project atomically with members
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Create the project
    const projectId = await ProjectModel.create(projectData);

    // Add initial members if provided
    if (initialMemberIds.length > 0) {
      for (const userId of initialMemberIds) {
        // Validate user exists
        const [[user]] = await conn.execute(
          `SELECT id FROM users WHERE id = ? AND deleted_at IS NULL`,
          [userId],
        );
        if (!user) {
          throw Object.assign(
            new Error(`User ${userId} not found or is deleted`),
            { status: 404 },
          );
        }

        // Insert into project_members
        await conn.execute(
          `INSERT INTO project_members (project_id, user_id, joined_date, role, left_date)
           VALUES (?, ?, CURDATE(), 'member', NULL)`,
          [projectId, userId],
        );
      }
    }

    await conn.commit();
    return projectId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

exports.update = async (id, data) => {
  const existing = await ProjectModel.getById(id);
  if (!existing)
    throw Object.assign(new Error("Project not found"), { status: 404 });
  // status is no longer required — PATCH semantics, only provided fields are updated
  await ProjectModel.update(id, data);
  // B-2: recalc status whenever project fields (especially due_date) change
  await ProjectModel.recalcStatus(id);
};

exports.remove = async (id) => {
  const existing = await ProjectModel.getById(id);
  if (!existing)
    throw Object.assign(new Error("Project not found"), { status: 404 });
  return ProjectModel.remove(id);
};
