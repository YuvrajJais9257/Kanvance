const pool = require("../config/db");

exports.getByMember = async (memberId) => {
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
