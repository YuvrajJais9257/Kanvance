const pool = require("../config/db");

/**
 * getByMember(memberId, requestingUserId, requestingRole)
 *
 * Returns subtasks for `memberId` using the same four-branch effective-owner
 * resolution as the timesheet grid query — so both views always agree:
 *
 *   1. Direct active task_assignment (unassigned_date IS NULL)
 *   2. Task-level inherited: activity_groups.assignee_id = memberId,
 *      no active task_assignments row on this subtask for anyone
 *   3. Subtask-level direct: subtasks.assignee_id = memberId,
 *      no active task_assignments row on this subtask
 *   4. Project-level fallback: project.owner_id = memberId,
 *      subtask has no assignee_id and no active task_assignments
 *
 * Visibility rules:
 *  - ADMIN / LEAD / MANAGER: can see tasks for any member
 *  - MEMBER: can only see their own tasks
 */
exports.getByMember = async (memberId, requestingUserId, requestingRole) => {
  const isPrivileged = ["ADMIN", "LEAD", "MANAGER"].includes(requestingRole);
  const isSelf = String(memberId) === String(requestingUserId);

  if (!isPrivileged && !isSelf) return [];

  const [rows] = await pool.execute(
    `SELECT
       s.id              AS subtask_id,
       s.name            AS subtask_name,
       s.status,
       s.due_date,
       s.flag_type,
       s.flag_reason,
       s.flag_waiting_on,
       s.assignee_id,
       ag.id             AS group_id,
       ag.name           AS group_name,
       p.id              AS project_id,
       p.owner_id,
       c.name            AS customer_name,
       eff.source        AS assignment_source,
       CASE WHEN eff.source = 'project_inherited' THEN 1 ELSE 0 END AS inherited
     FROM (
       -- Branch 1: direct active task_assignment
       SELECT subtask_id, ? AS user_id, 'direct' AS source
       FROM task_assignments
       WHERE user_id = ? AND unassigned_date IS NULL

       UNION

       -- Branch 2: task-level inherited via activity_groups.assignee_id
       SELECT s2.id AS subtask_id, ag2.assignee_id AS user_id, 'task_inherited' AS source
       FROM subtasks s2
       JOIN activity_groups ag2 ON ag2.id = s2.group_id
       WHERE ag2.assignee_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM task_assignments ta
           WHERE ta.subtask_id = s2.id AND ta.unassigned_date IS NULL
         )

       UNION

       -- Branch 3: subtask-level direct (legacy subtasks.assignee_id column)
       SELECT s3.id AS subtask_id, s3.assignee_id AS user_id, 'subtask_assignee' AS source
       FROM subtasks s3
       WHERE s3.assignee_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM task_assignments ta
           WHERE ta.subtask_id = s3.id AND ta.unassigned_date IS NULL
         )

       UNION

       -- Branch 4: project-level fallback (owner inherits unassigned subtasks)
       SELECT s4.id AS subtask_id, p4.owner_id AS user_id, 'project_inherited' AS source
       FROM subtasks s4
       JOIN activity_groups ag4 ON ag4.id = s4.group_id
       JOIN projects p4         ON p4.id  = ag4.project_id
       WHERE p4.owner_id = ?
         AND s4.assignee_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM task_assignments ta
           WHERE ta.subtask_id = s4.id AND ta.unassigned_date IS NULL
         )
     ) eff
     JOIN subtasks s         ON s.id   = eff.subtask_id
     JOIN activity_groups ag ON ag.id  = s.group_id
     JOIN projects p         ON p.id   = ag.project_id
     JOIN customers c        ON c.id   = p.customer_id
     ORDER BY p.name, ag.name, s.position`,
    [memberId, memberId, memberId, memberId, memberId]
  );

  // Sort: overdue → due soon → not done → done
  const toDateStr = (val) => {
    if (!val) return null;
    return typeof val === "string" ? val.split("T")[0] : new Date(val).toISOString().split("T")[0];
  };

  rows.sort((a, b) => {
    const today = new Date().toISOString().split("T")[0];
    const in7   = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

    const score = (r) => {
      if (r.status === "Done") return 4;
      const d = toDateStr(r.due_date);
      if (d && d < today) return 0;
      if (d && d <= in7)  return 1;
      if (!d)             return 2;
      return 3;
    };

    const diff = score(a) - score(b);
    if (diff !== 0) return diff;
    const da = toDateStr(a.due_date);
    const db = toDateStr(b.due_date);
    if (da && db) return da.localeCompare(db);
    return 0;
  });

  return rows;
};

/**
 * countUnassigned(projectId)
 * Returns the number of subtasks with no assignee for a given project.
 * Used by the project view to show the "N tasks defaulting to owner" banner.
 */
exports.countUnassigned = async (projectId) => {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS cnt
     FROM subtasks s
     JOIN activity_groups ag ON ag.id = s.group_id
     WHERE ag.project_id = ? AND s.assignee_id IS NULL`,
    [projectId]
  );
  return Number(row.cnt);
};
