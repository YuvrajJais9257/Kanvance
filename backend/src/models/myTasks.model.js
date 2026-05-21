const pool = require("../config/db");

/**
 * getByMember(memberId, requestingUserId, requestingRole)
 *
 * Returns subtasks for `memberId` using owner-inheritance:
 *   - Explicitly assigned subtasks (s.assignee_id = memberId)
 *   - Unassigned subtasks on projects owned by memberId (inherited)
 *
 * Visibility rules:
 *  - ADMIN / LEAD / MANAGER: can see tasks for any member
 *  - MEMBER: can only see their own tasks or tasks on shared projects
 */
exports.getByMember = async (memberId, requestingUserId, requestingRole) => {
  const isPrivileged = ["ADMIN", "LEAD", "MANAGER"].includes(requestingRole);
  const isSelf = String(memberId) === String(requestingUserId);

  if (!isPrivileged && !isSelf) {
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
    if (shared[0].cnt === 0) return [];
  }

  // ── Explicitly assigned subtasks ──────────────────────────────────────────
  const [explicit] = await pool.execute(
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
       0                 AS inherited
     FROM subtasks s
     JOIN activity_groups ag ON ag.id = s.group_id
     JOIN projects p         ON p.id  = ag.project_id
     JOIN customers c        ON c.id  = p.customer_id
     WHERE s.assignee_id = ?`,
    [memberId]
  );

  // ── Inherited: unassigned subtasks on projects owned by memberId ──────────
  const [inherited] = await pool.execute(
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
       1                 AS inherited
     FROM subtasks s
     JOIN activity_groups ag ON ag.id = s.group_id
     JOIN projects p         ON p.id  = ag.project_id
     JOIN customers c        ON c.id  = p.customer_id
     WHERE p.owner_id = ?
       AND s.assignee_id IS NULL`,
    [memberId]
  );

  // Merge, deduplicate (explicit wins if same subtask_id appears in both)
  const seen = new Set();
  const rows = [];
  for (const r of [...explicit, ...inherited]) {
    if (!seen.has(r.subtask_id)) {
      seen.add(r.subtask_id);
      rows.push(r);
    }
  }

  // Sort: overdue → due soon → not done → done
  // Belt-and-suspenders date normaliser — handles strings (dateStrings:true)
  // and JS Date objects equally, so toggling dateStrings never breaks sorting.
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
