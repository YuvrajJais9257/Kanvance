/**
 * analytics.model.js
 * All KPI queries for the Analytics dashboard.
 * Draws from: projects, activity_groups, subtasks, activity_logs, users.
 */
const pool = require("../config/db");

// ── 1. Task completion rates per project ──────────────────────────────────
exports.taskCompletionByProject = async () => {
  const [rows] = await pool.execute(
    `SELECT
       p.id                                              AS project_id,
       c.name                                            AS customer_name,
       p.name                                            AS project_name,
       p.type,
       p.status                                          AS project_status,
       p.due_date,
       COUNT(s.id)                                       AS total_subtasks,
       SUM(s.status = 'Done')                            AS done_subtasks,
       SUM(s.status = 'Blocked')                         AS blocked_subtasks,
       SUM(s.status = 'Awaiting Feedback')               AS awaiting_subtasks,
       SUM(s.status = 'In Progress')                     AS inprogress_subtasks,
       SUM(s.status = 'Not Started')                     AS notstarted_subtasks,
       ROUND(
         SUM(s.status = 'Done') / NULLIF(COUNT(s.id), 0) * 100
       , 1)                                              AS completion_pct
     FROM projects p
     JOIN customers c        ON c.id  = p.customer_id
     LEFT JOIN activity_groups ag ON ag.project_id = p.id
     LEFT JOIN subtasks s    ON s.group_id = ag.id
     GROUP BY p.id
     ORDER BY completion_pct DESC, p.created_at DESC`
  );
  return rows;
};

// ── 2. Overall summary KPI cards ──────────────────────────────────────────
exports.summary = async () => {
  const [[proj]] = await pool.execute(
    `SELECT
       COUNT(*)                                          AS total_projects,
       SUM(status = 'Completed')                         AS completed_projects,
       SUM(status = 'At Risk')                           AS at_risk_projects,
       SUM(status = 'Delayed')                           AS delayed_projects,
       SUM(status = 'On Track')                          AS on_track_projects
     FROM projects`
  );

  const [[tasks]] = await pool.execute(
    `SELECT
       COUNT(*)                                          AS total_subtasks,
       SUM(status = 'Done')                              AS done_subtasks,
       SUM(status = 'Blocked')                           AS blocked_subtasks,
       SUM(status = 'In Progress')                       AS inprogress_subtasks,
       SUM(status = 'Awaiting Feedback')                 AS awaiting_subtasks,
       ROUND(SUM(status = 'Done') / NULLIF(COUNT(*), 0) * 100, 1) AS overall_completion_pct
     FROM subtasks`
  );

  const [[hours]] = await pool.execute(
    `SELECT ROUND(COALESCE(SUM(hours), 0), 1) AS total_hours_logged
     FROM activity_logs`
  );

  const [[users]] = await pool.execute(
    `SELECT COUNT(*) AS active_users
     FROM users
     WHERE deleted_at IS NULL AND status = 'active'`
  );

  return { ...proj, ...tasks, ...hours, ...users };
};

// ── 3. Team utilisation — hours per user ─────────────────────────────────
// Reads total hours from time_logs (covers both app-logged and Excel-uploaded hours).
//
// IMPORTANT: time_logs and subtasks are aggregated in separate subqueries before
// joining to users. This prevents the classic JOIN-multiplication bug where
// N time_log rows × M subtask rows causes SUM(hours) to be inflated by M.
exports.teamUtilisation = async () => {
  const [rows] = await pool.execute(
    `SELECT
       u.id                                              AS user_id,
       u.name                                            AS user_name,
       u.role,
       ROUND(COALESCE(tl_agg.total_hours, 0), 1)        AS total_hours,
       COALESCE(tl_agg.projects_worked, 0)               AS projects_worked,
       COALESCE(tl_agg.days_logged, 0)                   AS days_logged,
       COALESCE(s_agg.assigned_subtasks, 0)              AS assigned_subtasks,
       COALESCE(s_agg.completed_subtasks, 0)             AS completed_subtasks,
       COALESCE(s_agg.blocked_subtasks, 0)               AS blocked_subtasks,
       COALESCE(s_agg.projects_count, 0)                 AS projects_count
     FROM users u

     -- Aggregate time_logs independently (no subtask join here)
     LEFT JOIN (
       SELECT
         employee_id,
         ROUND(SUM(hours), 1)              AS total_hours,
         COUNT(DISTINCT project_name)      AS projects_worked,
         COUNT(DISTINCT date)              AS days_logged
       FROM time_logs
       GROUP BY employee_id
     ) tl_agg ON tl_agg.employee_id = u.id

     -- Aggregate subtasks independently (no time_logs join here)
     LEFT JOIN (
       SELECT
         u2.id                                                         AS user_id,
         COUNT(DISTINCT s.id)                                          AS assigned_subtasks,
         SUM(s.status = 'Done')                                        AS completed_subtasks,
         SUM(s.status = 'Blocked')                                     AS blocked_subtasks,
         COUNT(DISTINCT ag.project_id)                                 AS projects_count
       FROM users u2
       JOIN subtasks s ON s.assignee_id = u2.id OR (
         s.assignee_id IS NULL AND EXISTS (
           SELECT 1 FROM activity_groups ag2
           JOIN projects p2 ON p2.id = ag2.project_id
           WHERE ag2.id = s.group_id AND p2.owner_id = u2.id
         )
       )
       JOIN activity_groups ag ON ag.id = s.group_id
       WHERE u2.deleted_at IS NULL AND u2.status = 'active'
       GROUP BY u2.id
     ) s_agg ON s_agg.user_id = u.id

     WHERE u.deleted_at IS NULL AND u.status = 'active'
     ORDER BY total_hours DESC`
  );
  return rows;
};

// ── 4. Hours per person per project ──────────────────────────────────────
exports.hoursPerPersonPerProject = async () => {
  const [rows] = await pool.execute(
    `SELECT
       u.id                                              AS user_id,
       u.name                                            AS user_name,
       p.id                                              AS project_id,
       c.name                                            AS customer_name,
       p.name                                            AS project_name,
       p.type                                            AS project_type,
       ROUND(SUM(al.hours), 1)                           AS hours_logged
     FROM activity_logs al
     JOIN users u    ON u.id = al.user_id
     JOIN projects p ON p.id = al.project_id
     JOIN customers c ON c.id = p.customer_id
     GROUP BY u.id, p.id
     ORDER BY u.name, hours_logged DESC`
  );
  return rows;
};

// ── 5. Blocked tasks with context ────────────────────────────────────────
exports.blockedTasks = async () => {
  const [rows] = await pool.execute(
    `SELECT
       s.id                                              AS subtask_id,
       s.name                                            AS subtask_name,
       s.status,
       s.flag_type,
       s.flag_reason,
       s.flag_waiting_on,
       s.due_date,
       ag.name                                           AS group_name,
       p.id                                              AS project_id,
       c.name                                            AS customer_name,
       p.name                                            AS project_name,
       u.name                                            AS assignee_name
     FROM subtasks s
     JOIN activity_groups ag ON ag.id = s.group_id
     JOIN projects p         ON p.id  = ag.project_id
     JOIN customers c        ON c.id  = p.customer_id
     LEFT JOIN users u       ON u.id  = s.assignee_id
     WHERE s.status IN ('Blocked', 'Awaiting Feedback')
     ORDER BY s.due_date ASC, p.id`
  );
  return rows;
};

// ── 6. Project progress over time (for trend chart) ──────────────────────
exports.projectProgressTrend = async () => {
  const [rows] = await pool.execute(
    `SELECT
       p.id                                              AS project_id,
       c.name                                            AS customer_name,
       p.name                                            AS project_name,
       p.status,
       p.start_date,
       p.due_date,
       COUNT(s.id)                                       AS total,
       SUM(s.status = 'Done')                            AS done,
       ROUND(SUM(s.status = 'Done') / NULLIF(COUNT(s.id), 0) * 100, 1) AS pct
     FROM projects p
     JOIN customers c        ON c.id  = p.customer_id
     LEFT JOIN activity_groups ag ON ag.project_id = p.id
     LEFT JOIN subtasks s    ON s.group_id = ag.id
     GROUP BY p.id
     HAVING total > 0
     ORDER BY pct DESC`
  );
  return rows;
};

// ── 7. Status breakdown across all subtasks (for pie/donut chart) ─────────
exports.subtaskStatusBreakdown = async () => {
  const [rows] = await pool.execute(
    `SELECT status, COUNT(*) AS count
     FROM subtasks
     GROUP BY status
     ORDER BY count DESC`
  );
  return rows;
};

// ── 8. Hours logged per day (for activity sparkline) ─────────────────────
exports.hoursPerDay = async (days = 30) => {
  const [rows] = await pool.query(
    `SELECT
       logged_date                                       AS date,
       ROUND(SUM(hours), 1)                              AS hours
     FROM activity_logs
     WHERE logged_date >= DATE_SUB(CURDATE(), INTERVAL ${Number(days)} DAY)
     GROUP BY logged_date
     ORDER BY logged_date ASC`
  );
  return rows;
};
