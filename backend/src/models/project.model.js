const pool = require("../config/db");

// Project templates — auto-inserted on project creation
const TEMPLATES = {
  Implementation: [
    {
      name: "Tenant Activation",
      subtasks: [
        "Provision the CyberArk Tenant",
        "Provide Access to Customer",
        "Provide Access to Implementor",
      ],
    },
    {
      name: "Cloud Connector (Windows)",
      subtasks: [
        "Install Connector Server",
        "Configure Connector",
        "Test Connectivity",
        "Onboard Windows Accounts",
        "Verify Rotation",
        "Sign-off",
      ],
    },
    {
      name: "UNIX Connector",
      subtasks: [
        "Install UNIX Connector",
        "Configure SSH Key",
        "Onboard UNIX Accounts",
        "Verify Rotation",
        "Sign-off",
      ],
    },
    {
      name: "Secure Tunnel",
      subtasks: ["Configure Secure Tunnel", "Validate Tunnel Connectivity"],
    },
  ],
  "Managed Service": [
    {
      name: "Onboarding",
      subtasks: [
        "Confirm scope",
        "Validate access list",
        "Prepare runbook",
        "Go-live checklist",
      ],
    },
    {
      name: "Monthly Operations",
      subtasks: ["Monthly health check", "Incident review", "Report to customer"],
    },
  ],
  "License Renewal": [
    {
      name: "Renewal Checklist",
      subtasks: [
        "Review current licenses",
        "Confirm user count",
        "Raise renewal PO",
        "Update contract",
        "Share confirmation with customer",
        "Internal approval",
        "Close renewal ticket",
      ],
    },
  ],
  "New Opportunity": [
    {
      name: "Discovery",
      subtasks: [
        "Initial discovery call",
        "Requirements gathering",
        "Stakeholder mapping",
      ],
    },
    {
      name: "POC",
      subtasks: ["POC environment setup", "Demo delivery", "POC sign-off"],
    },
  ],
};

// ── List all projects (summary) — supports optional ?page=&limit= ──
exports.getAll = async ({ page, limit } = {}) => {
  const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 200));
  const offset   = (pageNum - 1) * limitNum;

  // Use pool.query for LIMIT/OFFSET (avoids mysql2 prepared-statement integer binding issues)
  const [rows] = await pool.query(
    `SELECT
       p.id,
       p.customer_id,
       c.name          AS customer_name,
       p.name,
       p.subtitle,
       p.type,
       p.owner_id,
       u.name          AS owner_name,
       p.status,
       p.start_date,
       p.due_date,
       p.notes,
       COUNT(s.id)                                    AS total_count,
       SUM(s.status = 'Done')                         AS done_count,
       ROUND(SUM(s.status = 'Done') / NULLIF(COUNT(s.id), 0) * 100) AS progress
     FROM projects p
     JOIN customers c ON c.id = p.customer_id
     LEFT JOIN users u ON u.id = p.owner_id
     LEFT JOIN activity_groups ag ON ag.project_id = p.id
     LEFT JOIN subtasks s ON s.group_id = ag.id
     GROUP BY p.id
     ORDER BY p.created_at DESC
     LIMIT ${limitNum} OFFSET ${offset}`
  );
  return rows;
};

// ── List projects visible to a specific user ─────────────────────
// A user can see a project if:
//   - they are the project owner, OR
//   - they have at least one subtask assigned to them in that project
exports.getAllForUser = async ({ page, limit } = {}, userId) => {
  const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 200));
  const offset   = (pageNum - 1) * limitNum;

  const [rows] = await pool.query(
    `SELECT
       p.id,
       p.customer_id,
       c.name          AS customer_name,
       p.name,
       p.subtitle,
       p.type,
       p.owner_id,
       u.name          AS owner_name,
       p.status,
       p.start_date,
       p.due_date,
       p.notes,
       COUNT(s.id)                                    AS total_count,
       SUM(s.status = 'Done')                         AS done_count,
       ROUND(SUM(s.status = 'Done') / NULLIF(COUNT(s.id), 0) * 100) AS progress
     FROM projects p
     JOIN customers c ON c.id = p.customer_id
     LEFT JOIN users u ON u.id = p.owner_id
     LEFT JOIN activity_groups ag ON ag.project_id = p.id
     LEFT JOIN subtasks s ON s.group_id = ag.id
     WHERE p.owner_id = ${pool.escape(userId)}
        OR EXISTS (
          SELECT 1 FROM subtasks s2
          JOIN activity_groups ag2 ON ag2.id = s2.group_id
          WHERE ag2.project_id = p.id AND s2.assignee_id = ${pool.escape(userId)}
        )
     GROUP BY p.id
     ORDER BY p.created_at DESC
     LIMIT ${limitNum} OFFSET ${offset}`,
  );
  return rows;
};

// ── Single project with full task tree ──────────────────────────
exports.getById = async (id) => {
  // Project row
  const [[project]] = await pool.execute(
    `SELECT
       p.id,
       p.customer_id,
       c.name          AS customer_name,
       p.name,
       p.subtitle,
       p.type,
       p.owner_id,
       u.name          AS owner_name,
       p.status,
       p.start_date,
       p.due_date,
       p.notes
     FROM projects p
     JOIN customers c ON c.id = p.customer_id
     LEFT JOIN users u ON u.id = p.owner_id
     WHERE p.id = ?`,
    [id]
  );
  if (!project) return null;

  // Groups
  const [groups] = await pool.execute(
    `SELECT id, name, position FROM activity_groups WHERE project_id = ? ORDER BY position`,
    [id]
  );

  // Subtasks for all groups in one query
  const groupIds = groups.map((g) => g.id);
  let subtasks = [];
  if (groupIds.length) {
    const placeholders = groupIds.map(() => "?").join(",");
    const [rows] = await pool.execute(
      `SELECT
         s.id, s.group_id, s.name, s.status, s.due_date,
         s.assignee_id, u.name AS assignee_name,
         s.flag_type, s.flag_reason, s.flag_waiting_on, s.position
       FROM subtasks s
       LEFT JOIN users u ON u.id = s.assignee_id
       WHERE s.group_id IN (${placeholders})
       ORDER BY s.position`,
      groupIds
    );
    subtasks = rows;
  }

  // Nest subtasks into groups
  project.groups = groups.map((g) => {
    const subs = subtasks.filter((s) => s.group_id === g.id);
    return {
      ...g,
      completed: subs.filter((s) => s.status === "Done").length,
      total: subs.length,
      subtasks: subs,
    };
  });

  return project;
};

// ── Create project + auto-insert template ───────────────────────
exports.create = async (data) => {
  const { customer_id, type, owner_id, status, start_date, due_date, notes, name, subtitle } = data;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO projects
         (customer_id, name, subtitle, type, owner_id, status, start_date, due_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customer_id,
        name ?? null,
        subtitle ?? null,
        type,
        owner_id ?? null,
        status ?? "On Track",
        start_date ?? null,
        due_date ?? null,
        notes ?? null,
      ]
    );
    const projectId = result.insertId;

    // Insert template groups + subtasks
    const template = TEMPLATES[type] ?? [];
    for (let gi = 0; gi < template.length; gi++) {
      const group = template[gi];
      const [gResult] = await conn.execute(
        `INSERT INTO activity_groups (project_id, name, position) VALUES (?, ?, ?)`,
        [projectId, group.name, gi]
      );
      const groupId = gResult.insertId;
      for (let si = 0; si < group.subtasks.length; si++) {
        await conn.execute(
          `INSERT INTO subtasks (group_id, name, position) VALUES (?, ?, ?)`,
          [groupId, group.subtasks[si], si]
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

// ── Update project (PATCH semantics — only update provided fields) ──
exports.update = async (id, data) => {
  const existing = await pool.execute(
    `SELECT id, owner_id, status, start_date, due_date, notes, name, subtitle FROM projects WHERE id = ?`,
    [id]
  ).then(([[row]]) => row);
  if (!existing) return;

  // Merge: only override fields that are explicitly provided
  const merged = {
    owner_id:   "owner_id"   in data ? (data.owner_id ?? null)   : existing.owner_id,
    status:     "status"     in data ? data.status               : existing.status,
    start_date: "start_date" in data ? (data.start_date ?? null) : existing.start_date,
    due_date:   "due_date"   in data ? (data.due_date ?? null)   : existing.due_date,
    notes:      "notes"      in data ? (data.notes ?? null)      : existing.notes,
    name:       "name"       in data ? (data.name ?? null)       : existing.name,
    subtitle:   "subtitle"   in data ? (data.subtitle ?? null)   : existing.subtitle,
  };

  await pool.execute(
    `UPDATE projects
     SET owner_id = ?, status = ?, start_date = ?, due_date = ?, notes = ?,
         name = ?, subtitle = ?
     WHERE id = ?`,
    [
      merged.owner_id, merged.status, merged.start_date, merged.due_date,
      merged.notes, merged.name, merged.subtitle, id,
    ]
  );
};

// ── Delete project ───────────────────────────────────────────────
exports.remove = async (id) => {
  await pool.execute("DELETE FROM projects WHERE id = ?", [id]);
};

// ── Auto-derive status from subtask completion ───────────────────
// Called after any subtask status change.
//
// STATUS DERIVATION RULES (in priority order):
//
// 1. COMPLETED
//    - All subtasks are Done (100% progress)
//
// 2. DELAYED
//    - Project due date is in the past AND progress < 100%
//    - OR: Any subtask is overdue (due_date < today AND status != Done)
//
// 3. AT RISK
//    - Any subtask is Blocked or Awaiting Feedback
//    - OR: Project due date is within 14 days AND progress < 70%
//    - OR: Progress < 50% AND more than 50% of time elapsed
//
// 4. ON TRACK
//    - Default state when none of the above apply
//
// 5. PROSPECTING / ON HOLD
//    - Manual statuses — never auto-overridden
//
exports.recalcStatus = async (projectId) => {
  const [[row]] = await pool.execute(
    `SELECT
       p.id,
       p.status                                AS current_status,
       p.due_date,
       p.start_date,
       COUNT(s.id)                             AS total,
       SUM(s.status = 'Done')                  AS done,
       SUM(s.status IN ('Blocked', 'Awaiting Feedback')) AS blocked,
       SUM(s.due_date < CURDATE() AND s.status != 'Done') AS overdue_tasks,
       DATEDIFF(p.due_date, CURDATE())         AS days_until_due,
       DATEDIFF(CURDATE(), p.start_date)       AS days_elapsed,
       DATEDIFF(p.due_date, p.start_date)      AS total_duration
     FROM projects p
     LEFT JOIN activity_groups ag ON ag.project_id = p.id
     LEFT JOIN subtasks s          ON s.group_id   = ag.id
     WHERE p.id = ?
     GROUP BY p.id, p.status, p.due_date, p.start_date`,
    [projectId]
  );

  if (!row) return;

  const {
    current_status,
    total,
    done,
    blocked,
    overdue_tasks,
    days_until_due,
    days_elapsed,
    total_duration,
    due_date,
  } = row;

  // Never override manual statuses
  if (["Prospecting", "On Hold"].includes(current_status)) return;

  // No tasks → check only due date for Delayed (B-1 fix)
  if (total === 0) {
    if (!["Prospecting", "On Hold"].includes(current_status)) {
      if (due_date && days_until_due < 0 && current_status !== "Delayed") {
        await pool.execute("UPDATE projects SET status = 'Delayed' WHERE id = ?", [projectId]);
      }
    }
    return;
  }

  const progress = Math.round((Number(done) / Number(total)) * 100); // I-4: explicit cast
  const timeElapsedPct = total_duration > 0 ? (days_elapsed / total_duration) * 100 : 0;

  let newStatus = current_status;

  // Rule 1: COMPLETED
  if (progress === 100) {
    newStatus = "Completed";
  }
  // Rule 2: DELAYED
  else if (
    (due_date && days_until_due < 0) || // project overdue
    overdue_tasks > 0                    // any subtask overdue
  ) {
    newStatus = "Delayed";
  }
  // Rule 3: AT RISK
  else if (
    blocked > 0 ||                                    // any blocked/awaiting feedback
    (due_date && days_until_due <= 14 && progress < 70) || // due soon + low progress
    (timeElapsedPct > 50 && progress < 50)            // behind schedule
  ) {
    newStatus = "At Risk";
  }
  // Rule 4: ON TRACK
  else {
    newStatus = "On Track";
  }

  // Only update if status changed
  if (newStatus !== current_status) {
    await pool.execute(
      "UPDATE projects SET status = ? WHERE id = ?",
      [newStatus, projectId]
    );
  }
};
