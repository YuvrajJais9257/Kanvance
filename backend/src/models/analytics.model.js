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
     ORDER BY completion_pct DESC, p.created_at DESC`,
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
     FROM projects`,
  );

  const [[tasks]] = await pool.execute(
    `SELECT
       COUNT(*)                                          AS total_subtasks,
       SUM(status = 'Done')                              AS done_subtasks,
       SUM(status = 'Blocked')                           AS blocked_subtasks,
       SUM(status = 'In Progress')                       AS inprogress_subtasks,
       SUM(status = 'Awaiting Feedback')                 AS awaiting_subtasks,
       ROUND(SUM(status = 'Done') / NULLIF(COUNT(*), 0) * 100, 1) AS overall_completion_pct
     FROM subtasks`,
  );

  const [[hours]] = await pool.execute(
    process.env.USE_TIMESHEET_ENTRIES_AS_SOURCE === "true"
      ? `SELECT
           ROUND(COALESCE(SUM(hours_logged), 0), 1) AS total_hours_logged,
           ROUND(COALESCE(SUM(CASE WHEN time_type IN ('Billable','Non-billable','Overtime','Training') THEN hours_logged ELSE 0 END), 0), 1) AS working_hours,
           ROUND(COALESCE(SUM(CASE WHEN time_type = 'Billable' THEN hours_logged ELSE 0 END), 0), 1) AS billable_hours,
           ROUND(COALESCE(SUM(CASE WHEN time_type IN ('Holidays','Sick Time','Vacation') THEN hours_logged ELSE 0 END), 0), 1) AS leave_hours,
           ROUND(COALESCE(SUM(CASE WHEN time_type = 'Overtime' THEN hours_logged ELSE 0 END), 0), 1) AS overtime_hours
         FROM timesheet_entries`
      : `SELECT ROUND(COALESCE(SUM(hours), 0), 1) AS total_hours_logged FROM activity_logs`,
  );

  const [[users]] = await pool.execute(
    `SELECT COUNT(*) AS active_users
     FROM users
     WHERE deleted_at IS NULL AND status = 'active'`,
  );

  return { ...proj, ...tasks, ...hours, ...users };
};

// ── 3. Team utilisation — hours per user ─────────────────────────────────
// When USE_TIMESHEET_ENTRIES_AS_SOURCE=true, reads from timesheet_entries.
// Otherwise reads from time_logs (covers both app-logged and Excel-uploaded hours).
//
// IMPORTANT: hours and subtasks are aggregated in separate subqueries before
// joining to users. This prevents the classic JOIN-multiplication bug where
// N log rows × M subtask rows causes SUM(hours) to be inflated by M.
exports.teamUtilisation = async () => {
  const useTimesheetEntries =
    process.env.USE_TIMESHEET_ENTRIES_AS_SOURCE === "true";

  const hoursSubquery = useTimesheetEntries
    ? `SELECT
         user_id,
         ROUND(SUM(hours_logged), 1)           AS total_hours,
         ROUND(SUM(CASE WHEN time_type IN ('Billable', 'Non-billable', 'Overtime', 'Training') THEN hours_logged ELSE 0 END), 1) AS working_hours,
         ROUND(SUM(CASE WHEN time_type = 'Billable' THEN hours_logged ELSE 0 END), 2)          AS billable_hours,
         ROUND(SUM(CASE WHEN time_type IN ('Holidays','Sick Time','Vacation') THEN hours_logged ELSE 0 END), 1) AS leave_hours,
         ROUND(SUM(CASE WHEN time_type = 'Overtime' THEN hours_logged ELSE 0 END), 1)          AS overtime_hours,
         COUNT(DISTINCT date)                   AS days_logged,
         COUNT(DISTINCT subtask_id)             AS projects_worked
       FROM timesheet_entries
       GROUP BY user_id`
    : `SELECT
         employee_id,
         ROUND(SUM(hours), 1)                  AS total_hours,
         COUNT(DISTINCT project_name)           AS projects_worked,
         COUNT(DISTINCT date)                   AS days_logged
       FROM time_logs
       GROUP BY employee_id`;

  const hoursJoinAlias = useTimesheetEntries ? "te_agg" : "tl_agg";
  const hoursJoinKey = useTimesheetEntries
    ? "te_agg.user_id = u.id"
    : "tl_agg.employee_id = u.id";

  const extraColumns = useTimesheetEntries
    ? `,
       ROUND(COALESCE(te_agg.working_hours, 0), 2) AS working_hours,
       ROUND(COALESCE(te_agg.billable_hours, 0), 2) AS billable_hours,
       ROUND(COALESCE(te_agg.leave_hours, 0), 2) AS leave_hours,
       ROUND(COALESCE(te_agg.overtime_hours, 0), 2) AS overtime_hours,
       ROUND(
         COALESCE(te_agg.billable_hours, 0) /
         NULLIF(COALESCE(te_agg.working_hours, 0), 0) * 100
       , 1) AS utilization_pct`
    : "";

  const [rows] = await pool.execute(
    `SELECT
       u.id                                              AS user_id,
       u.name                                            AS user_name,
       u.role,
       ROUND(COALESCE(${hoursJoinAlias}.total_hours, 0), 1)        AS total_hours,
       COALESCE(${hoursJoinAlias}.projects_worked, 0)               AS projects_worked,
       COALESCE(${hoursJoinAlias}.days_logged, 0)                   AS days_logged,
       COALESCE(s_agg.assigned_subtasks, 0)              AS assigned_subtasks,
       COALESCE(s_agg.completed_subtasks, 0)             AS completed_subtasks,
       COALESCE(s_agg.blocked_subtasks, 0)               AS blocked_subtasks,
       COALESCE(s_agg.projects_count, 0)                 AS projects_count,
       COALESCE(s_agg.project_member_count, 0)           AS project_member_count${extraColumns}
     FROM users u

     -- Aggregate hours source independently (no subtask join here)
     LEFT JOIN (
       ${hoursSubquery}
     ) ${hoursJoinAlias} ON ${hoursJoinKey}

     -- Aggregate subtasks independently (no hours join here)
     LEFT JOIN (
       SELECT
         eff_owner.user_id                                             AS user_id,
         COUNT(DISTINCT s.id)                                          AS assigned_subtasks,
         SUM(s.status = 'Done')                                        AS completed_subtasks,
         SUM(s.status = 'Blocked')                                     AS blocked_subtasks,
         COUNT(DISTINCT ag.project_id)                                 AS projects_count,
         SUM((SELECT COUNT(*) FROM project_members pm
              WHERE pm.project_id = p.id AND pm.left_date IS NULL))   AS project_member_count
       FROM subtasks s
       JOIN activity_groups ag ON ag.id = s.group_id
       JOIN projects p         ON p.id  = ag.project_id
       -- Effective_Owner derived table: resolves owner via Active_Assignment → task assignee → project owner
       JOIN (
         SELECT
           s2.id AS subtask_id,
           COALESCE(
             (SELECT ta.user_id FROM task_assignments ta
              WHERE ta.subtask_id = s2.id AND ta.unassigned_date IS NULL
              ORDER BY ta.assigned_date DESC, ta.id DESC LIMIT 1),
             ag2.assignee_id,
             p2.owner_id
           ) AS user_id
         FROM subtasks s2
         JOIN activity_groups ag2 ON ag2.id = s2.group_id
         JOIN projects p2         ON p2.id  = ag2.project_id
       ) eff_owner ON eff_owner.subtask_id = s.id AND eff_owner.user_id IS NOT NULL
       GROUP BY eff_owner.user_id
     ) s_agg ON s_agg.user_id = u.id

     WHERE u.deleted_at IS NULL AND u.status = 'active'
     ORDER BY total_hours DESC`,
  );
  return rows;
};

// ── 4. Hours per person per project ──────────────────────────────────────
exports.hoursPerPersonPerProject = async () => {
  if (process.env.USE_TIMESHEET_ENTRIES_AS_SOURCE === "true") {
    const [rows] = await pool.execute(
      `SELECT
         u.id                                              AS user_id,
         u.name                                            AS user_name,
         p.id                                              AS project_id,
         c.name                                            AS customer_name,
         p.name                                            AS project_name,
         p.type                                            AS project_type,
         ROUND(SUM(te.hours_logged), 1)                    AS hours_logged
       FROM timesheet_entries te
       JOIN subtasks s         ON s.id  = te.subtask_id
       JOIN activity_groups ag ON ag.id = s.group_id
       JOIN projects p         ON p.id  = ag.project_id
       JOIN customers c        ON c.id  = p.customer_id
       JOIN users u            ON u.id  = te.user_id
       GROUP BY u.id, p.id
       ORDER BY u.name, hours_logged DESC`,
    );
    return rows;
  }

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
     ORDER BY u.name, hours_logged DESC`,
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
     ORDER BY s.due_date ASC, p.id`,
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
     ORDER BY pct DESC`,
  );
  return rows;
};

// ── 7. Status breakdown across all subtasks (for pie/donut chart) ─────────
exports.subtaskStatusBreakdown = async () => {
  const [rows] = await pool.execute(
    `SELECT status, COUNT(*) AS count
     FROM subtasks
     GROUP BY status
     ORDER BY count DESC`,
  );
  return rows;
};

// ── 8. Hours logged per day (for activity sparkline) ─────────────────────
exports.hoursPerDay = async (days = 30) => {
  if (process.env.USE_TIMESHEET_ENTRIES_AS_SOURCE === "true") {
    const [rows] = await pool.query(
      `SELECT
         date,
         ROUND(SUM(hours_logged), 1) AS hours
       FROM timesheet_entries
       WHERE date >= DATE_SUB(CURDATE(), INTERVAL ${Number(days)} DAY)
       GROUP BY date
       ORDER BY date ASC`,
    );
    return rows;
  }

  const [rows] = await pool.query(
    `SELECT
       logged_date                                       AS date,
       ROUND(SUM(hours), 1)                              AS hours
     FROM activity_logs
     WHERE logged_date >= DATE_SUB(CURDATE(), INTERVAL ${Number(days)} DAY)
     GROUP BY logged_date
     ORDER BY logged_date ASC`,
  );
  return rows;
};

// ── 9. Tasks per user with hours (for expandable utilisation cards) ──────
// Returns each user's assigned subtasks with project/task context and
// total hours logged against that subtask (from timesheet_entries).
// Used by GET /api/analytics/user-tasks.
exports.userTasksDetail = async () => {
  const [rows] = await pool.execute(
    `SELECT
       u.id                                                          AS user_id,
       u.name                                                        AS user_name,
       p.id                                                          AS project_id,
       c.name                                                        AS customer_name,
       p.name                                                        AS project_name,
       ag.id                                                         AS group_id,
       ag.name                                                       AS group_name,
       s.id                                                          AS subtask_id,
       s.name                                                        AS subtask_name,
       s.status                                                      AS subtask_status,
       s.due_date                                                    AS due_date,
       ROUND(COALESCE(SUM(te.hours_logged), 0), 1)                   AS hours_logged
     FROM subtasks s
     JOIN activity_groups ag ON ag.id = s.group_id
     JOIN projects p         ON p.id  = ag.project_id
     JOIN customers c        ON c.id  = p.customer_id
     -- Resolve effective owner the same way as teamUtilisation
     JOIN (
       SELECT
         s2.id AS subtask_id,
         COALESCE(
           (SELECT ta.user_id FROM task_assignments ta
            WHERE ta.subtask_id = s2.id AND ta.unassigned_date IS NULL
            ORDER BY ta.assigned_date DESC, ta.id DESC LIMIT 1),
           ag2.assignee_id,
           p2.owner_id
         ) AS user_id
       FROM subtasks s2
       JOIN activity_groups ag2 ON ag2.id = s2.group_id
       JOIN projects p2         ON p2.id  = ag2.project_id
     ) eff ON eff.subtask_id = s.id AND eff.user_id IS NOT NULL
     JOIN users u ON u.id = eff.user_id AND u.deleted_at IS NULL AND u.status = 'active'
     LEFT JOIN timesheet_entries te
       ON te.subtask_id = s.id AND te.user_id = u.id
     GROUP BY u.id, p.id, ag.id, s.id
     ORDER BY u.name, p.name, ag.name, s.name`,
  );
  return rows;
};

// ── 10. Start delay by user ───────────────────────────────────────────────
// Returns, per active user, how many days elapsed between their earliest
// task assignment and when they first logged time on that task.
// Users with no assignments are excluded (INNER JOIN on task_assignments).
// start_delay_days is NULL when no timesheet_entries exist for the pair,
// because MIN(te.date) is NULL, making DATEDIFF return NULL.
exports.startDelayByUser = async () => {
  const [rows] = await pool.execute(
    `SELECT
       u.id                                                           AS user_id,
       MIN(ta.assigned_date)                                          AS earliest_assigned_date,
       MIN(te.date)                                                   AS first_activity_date,
       FLOOR(DATEDIFF(
         COALESCE(MIN(te.date), CURDATE()),
         MIN(ta.assigned_date)
       ))                                                             AS start_delay_days
     FROM users u
     JOIN task_assignments ta ON ta.user_id = u.id
     JOIN subtasks s          ON s.id = ta.subtask_id AND s.status != 'Done'
     LEFT JOIN timesheet_entries te
       ON te.user_id     = ta.user_id
       AND te.subtask_id = ta.subtask_id
     WHERE u.deleted_at IS NULL AND u.status = 'active'
     GROUP BY u.id`,
  );
  return rows;
};
