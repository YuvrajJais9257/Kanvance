const TeamService = require("../services/team.service");
const pool = require("../config/db");
const { getEffectiveRole } = require("../middlewares/requireRole");

exports.getAll = async (req, res, next) => {
  try {
    const role   = getEffectiveRole(req.session);
    const userId = req.session.userId;

    // ADMIN and MASTER_ADMIN see everyone.
    // MANAGER sees only themselves + members who share at least one project.
    // Everyone else (MEMBER, LEAD) sees the full list (used for assignment pickers etc.).
    if (role === "MANAGER") {
      const [rows] = await pool.execute(
        `SELECT DISTINCT u.id, u.name, u.email, u.created_at
         FROM users u
         WHERE u.deleted_at IS NULL AND u.status != 'disabled'
           AND (
             -- always include the manager themselves
             u.id = ?
             OR
             -- include members who are on the same project as this manager
             -- (project owned by manager OR manager has a task_assignment on it)
             EXISTS (
               SELECT 1 FROM projects p
               WHERE (
                 p.owner_id = ?
                 OR EXISTS (
                   SELECT 1 FROM task_assignments ta_mgr
                   JOIN subtasks s_mgr ON s_mgr.id = ta_mgr.subtask_id
                   JOIN activity_groups ag_mgr ON ag_mgr.id = s_mgr.group_id
                   WHERE ag_mgr.project_id = p.id
                     AND ta_mgr.user_id = ?
                     AND ta_mgr.unassigned_date IS NULL
                 )
               )
               AND (
                 -- the other user is directly assigned a subtask on that project
                 EXISTS (
                   SELECT 1 FROM subtasks s2
                   JOIN activity_groups ag2 ON ag2.id = s2.group_id
                   WHERE ag2.project_id = p.id AND s2.assignee_id = u.id
                 )
                 OR
                 EXISTS (
                   SELECT 1 FROM task_assignments ta2
                   JOIN subtasks s3 ON s3.id = ta2.subtask_id
                   JOIN activity_groups ag3 ON ag3.id = s3.group_id
                   WHERE ag3.project_id = p.id
                     AND ta2.user_id = u.id
                     AND ta2.unassigned_date IS NULL
                 )
                 OR
                 -- or the other user owns that project
                 p.owner_id = u.id
               )
             )
           )
         ORDER BY u.name`,
        [userId, userId, userId]
      );
      return res.json(rows);
    }

    res.json(await TeamService.getAll());
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const result = await TeamService.create(req.body);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await TeamService.remove(req.params.id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
};
