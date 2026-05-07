const pool = require("../config/db");

exports.getSummary = async () => {
  // Total projects + breakdown by type
  const [byType] = await pool.execute(
    `SELECT type, COUNT(*) AS cnt FROM projects GROUP BY type`
  );

  const [totalRow] = await pool.execute(
    `SELECT COUNT(*) AS total FROM projects`
  );

  // Needs attention: At Risk, Delayed, OR has blocked/flagged subtasks
  // B-3 fix: use HAVING instead of WHERE for subtask conditions to avoid
  // pre-GROUP BY row explosion and duplicate project entries.
  const [attention] = await pool.execute(
    `SELECT
       p.id,
       c.name  AS customer_name,
       p.type,
       u.name  AS owner_name,
       p.status,
       COUNT(CASE WHEN s.flag_type IS NOT NULL
                    OR s.status IN ('Blocked','Awaiting Feedback')
                  THEN 1 END) AS blocked_count
     FROM projects p
     JOIN customers c ON c.id = p.customer_id
     LEFT JOIN users u ON u.id = p.owner_id
     LEFT JOIN activity_groups ag ON ag.project_id = p.id
     LEFT JOIN subtasks s ON s.group_id = ag.id
     GROUP BY p.id, c.name, p.type, u.name, p.status
     HAVING p.status IN ('At Risk','Delayed')
         OR blocked_count > 0
     ORDER BY p.status DESC`
  );

  // Due in 30 days
  const [due30] = await pool.execute(
    `SELECT p.id, c.name AS customer_name, p.type, p.due_date
     FROM projects p
     JOIN customers c ON c.id = p.customer_id
     WHERE p.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
       AND p.status != 'Completed'
     ORDER BY p.due_date`
  );

  const byTypeMap = {};
  byType.forEach((r) => { byTypeMap[r.type] = r.cnt; });

  return {
    total_projects: totalRow[0].total,
    by_type: byTypeMap,
    needs_attention: attention,
    due_in_30_days: due30,
  };
};
