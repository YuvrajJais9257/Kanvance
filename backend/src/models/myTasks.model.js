const pool = require("../config/db");

/**
 * getByMember(memberId, requestingUserId, requestingRole)
 *
 * Returns subtasks assigned to `memberId`, ordered by urgency.
 *
 * Visibility rules:
 *  - ADMIN / MANAGER: can see tasks for any member
 *  - MEMBER: can only see tasks for members who share at least one project
 *    with them (project-based visibility), or their own tasks
 */
exports.getByMember = async (memberId, requestingUserId, requestingRole) => {
  const isPrivileged = ["ADMIN", "LEAD", "MANAGER"].includes(requestingRole);
  const isSelf = String(memberId) === String(requestingUserId);

  // Non-privileged users can only view tasks for themselves or members
  // who share a project with them.
  if (!isPrivileged && !isSelf) {
    // Check if requestingUser and memberId share at least one project
    const [shared] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM projects p1
       JOIN projects p2 ON p2.customer_id = p1.customer_id
       WHERE (p1.owner_id = ? OR EXISTS (
         SELECT 1 FROM subtasks s1
         JOIN activity_groups ag1 ON ag1.id = s1.group_id
         WHERE ag1.project_id = p1.id AND s1.assignee_id = ?
       ))
       AND (p2.owner_id = ? OR EXISTS (
         SELECT 1 FROM subtasks s2
         JOIN activity_groups ag2 ON ag2.id = s2.group_id
         WHERE ag2.project_id = p2.id AND s2.assignee_id = ?
       ))`,
      [requestingUserId, requestingUserId, memberId, memberId]
    );
    if (shared[0].cnt === 0) {
      return []; // no shared project — return empty
    }
  }

  const [rows] = await pool.execute(
    `SELECT
       s.id          AS subtask_id,
       s.name        AS subtask_name,
       s.status,
       s.due_date,
       s.flag_type,
       s.flag_reason,
       s.flag_waiting_on,
       ag.id         AS group_id,
       ag.name       AS group_name,
       p.id          AS project_id,
       c.name        AS customer_name
     FROM subtasks s
     JOIN activity_groups ag ON ag.id = s.group_id
     JOIN projects p         ON p.id  = ag.project_id
     JOIN customers c        ON c.id  = p.customer_id
     WHERE s.assignee_id = ?
     ORDER BY
       -- 1. overdue + not Done
       CASE WHEN s.due_date < CURDATE() AND s.status != 'Done' THEN 0 ELSE 1 END,
       -- 2. due within 7 days + not Done
       CASE WHEN s.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
                 AND s.status != 'Done' THEN 0 ELSE 1 END,
       -- 3. not Done, no due date
       CASE WHEN s.status != 'Done' AND s.due_date IS NULL THEN 0 ELSE 1 END,
       -- 4. Done last
       CASE WHEN s.status = 'Done' THEN 1 ELSE 0 END,
       s.due_date ASC`,
    [memberId]
  );
  return rows;
};
