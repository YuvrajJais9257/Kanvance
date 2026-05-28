/**
 * activityLog.controller.js
 * Daily activity logging for users + team reporting for managers/admins
 */
const ActivityLogModel = require("../models/activityLog.model");
const pool = require("../config/db");

// POST /api/activity-logs — Log a single activity entry
exports.create = async (req, res, next) => {
  try {
    const { date, project_id, subtask_id, hours, status, notes } = req.body;
    const userId = req.session.userId;
    const userName = req.session.userName || "Unknown";

    // Validation
    if (!date || !project_id || !hours) {
      return res.status(400).json({ 
        error: "Missing required fields: date, project_id, hours" 
      });
    }

    if (hours <= 0 || hours > 24) {
      return res.status(400).json({ 
        error: "Hours must be between 0 and 24" 
      });
    }

    // Check if user has access to this project
    const [[project]] = await pool.execute(
      `SELECT p.id, p.owner_id 
       FROM projects p
       WHERE p.id = ?`,
      [project_id]
    );

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Members can only log to projects they own or are assigned to
    const userRole = req.session.userRole || "MEMBER";
    if (userRole === "MEMBER") {
      const [[assigned]] = await pool.execute(
        `SELECT 1 FROM subtasks s
         JOIN activity_groups ag ON ag.id = s.group_id
         WHERE ag.project_id = ? 
           AND (s.assignee_id = ? OR (s.assignee_id IS NULL AND ? = ?))
         LIMIT 1`,
        [project_id, userId, project.owner_id, userId]
      );

      if (!assigned) {
        return res.status(403).json({ 
          error: "You don't have access to log hours on this project" 
        });
      }
    }

    // Create activity log entry
    const logId = await ActivityLogModel.create({
      subtask_id: subtask_id || null,
      project_id,
      user_id: userId,
      employee: userName,
      logged_date: date,
      hours,
      notes: notes || null,
    });

    // Optionally update subtask status if provided
    if (subtask_id && status) {
      await pool.execute(
        "UPDATE subtasks SET status = ? WHERE id = ?",
        [status, subtask_id]
      );
    }

    res.status(201).json({ 
      id: logId, 
      message: "Activity logged successfully" 
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/activity-logs/me — Get current user's activity logs
exports.getMyLogs = async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const { date, start_date, end_date } = req.query;

    let dateFilter = "";
    const params = [userId];

    if (date) {
      dateFilter = "AND al.logged_date = ?";
      params.push(date);
    } else if (start_date && end_date) {
      dateFilter = "AND al.logged_date BETWEEN ? AND ?";
      params.push(start_date, end_date);
    } else {
      // Default to last 30 days
      dateFilter = "AND al.logged_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
    }

    const [rows] = await pool.execute(
      `SELECT 
         al.id,
         al.logged_date AS date,
         al.hours,
         al.notes,
         al.created_at,
         p.id AS project_id,
         p.name AS project_name,
         c.name AS customer_name,
         ag.name AS task_name,
         s.id AS subtask_id,
         s.name AS subtask_name,
         s.status
       FROM activity_logs al
       JOIN projects p ON p.id = al.project_id
       JOIN customers c ON c.id = p.customer_id
       LEFT JOIN subtasks s ON s.id = al.subtask_id
       LEFT JOIN activity_groups ag ON ag.id = s.group_id
       WHERE al.user_id = ? ${dateFilter}
       ORDER BY al.logged_date DESC, al.created_at DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
};

// GET /api/activity-logs/user/:userId — Get another user's logs (admins/managers only)
exports.getUserLogs = async (req, res, next) => {
  try {
    const currentUserId = req.session.userId;
    const currentUserRole = req.session.userRole || "MEMBER";
    const targetUserId = req.params.userId;
    const { start_date, end_date } = req.query;

    // Access control
    if (currentUserRole === "MEMBER" && currentUserId != targetUserId) {
      return res.status(403).json({ 
        error: "You don't have permission to view other users' activity logs" 
      });
    }

    // Managers can only see logs for users in their projects
    if (currentUserRole === "MANAGER") {
      const [[access]] = await pool.execute(
        `SELECT 1 FROM projects p
         JOIN activity_groups ag ON ag.project_id = p.id
         JOIN subtasks s ON s.group_id = ag.id
         WHERE p.owner_id = ? 
           AND (s.assignee_id = ? OR (s.assignee_id IS NULL AND p.owner_id = ?))
         LIMIT 1`,
        [currentUserId, targetUserId, targetUserId]
      );

      if (!access) {
        return res.status(403).json({ 
          error: "You don't have permission to view this user's activity logs" 
        });
      }
    }

    let dateFilter = "";
    const params = [targetUserId];

    if (start_date && end_date) {
      dateFilter = "AND al.logged_date BETWEEN ? AND ?";
      params.push(start_date, end_date);
    } else {
      // Default to last 30 days
      dateFilter = "AND al.logged_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
    }

    const [rows] = await pool.execute(
      `SELECT 
         al.id,
         al.logged_date AS date,
         al.hours,
         al.notes,
         al.created_at,
         p.id AS project_id,
         p.name AS project_name,
         c.name AS customer_name,
         ag.name AS task_name,
         s.id AS subtask_id,
         s.name AS subtask_name,
         s.status,
         u.name AS user_name
       FROM activity_logs al
       JOIN projects p ON p.id = al.project_id
       JOIN customers c ON c.id = p.customer_id
       LEFT JOIN users u ON u.id = al.user_id
       LEFT JOIN subtasks s ON s.id = al.subtask_id
       LEFT JOIN activity_groups ag ON ag.id = s.group_id
       WHERE al.user_id = ? ${dateFilter}
       ORDER BY al.logged_date DESC, al.created_at DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
};

// PUT /api/activity-logs/:id — Update an activity log entry
exports.update = async (req, res, next) => {
  try {
    const logId = req.params.id;
    const userId = req.session.userId;
    const userRole = req.session.userRole || "MEMBER";
    const { hours, status, notes } = req.body;

    // Check ownership
    const [[log]] = await pool.execute(
      "SELECT user_id, subtask_id FROM activity_logs WHERE id = ?",
      [logId]
    );

    if (!log) {
      return res.status(404).json({ error: "Activity log not found" });
    }

    // Members can only edit their own logs
    if (userRole === "MEMBER" && log.user_id != userId) {
      return res.status(403).json({ 
        error: "You can only edit your own activity logs" 
      });
    }

    // Update activity log
    const updates = [];
    const params = [];

    if (hours !== undefined) {
      if (hours <= 0 || hours > 24) {
        return res.status(400).json({ error: "Hours must be between 0 and 24" });
      }
      updates.push("hours = ?");
      params.push(hours);
    }

    if (notes !== undefined) {
      updates.push("notes = ?");
      params.push(notes || null);
    }

    if (updates.length > 0) {
      params.push(logId);
      await pool.execute(
        `UPDATE activity_logs SET ${updates.join(", ")} WHERE id = ?`,
        params
      );
    }

    // Update subtask status if provided
    if (log.subtask_id && status) {
      await pool.execute(
        "UPDATE subtasks SET status = ? WHERE id = ?",
        [status, log.subtask_id]
      );
    }

    res.json({ message: "Activity log updated successfully" });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/activity-logs/:id — Delete an activity log entry
exports.remove = async (req, res, next) => {
  try {
    const logId = req.params.id;
    const userId = req.session.userId;
    const userRole = req.session.userRole || "MEMBER";

    // Check ownership
    const [[log]] = await pool.execute(
      "SELECT user_id FROM activity_logs WHERE id = ?",
      [logId]
    );

    if (!log) {
      return res.status(404).json({ error: "Activity log not found" });
    }

    // Members can only delete their own logs
    if (userRole === "MEMBER" && log.user_id != userId) {
      return res.status(403).json({ 
        error: "You can only delete your own activity logs" 
      });
    }

    await pool.execute("DELETE FROM activity_logs WHERE id = ?", [logId]);

    res.json({ message: "Activity log deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// GET /api/activity-logs/summary — Get summary stats for current user
exports.getMySummary = async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const { start_date, end_date } = req.query;

    let dateFilter = "";
    const params = [userId];

    if (start_date && end_date) {
      dateFilter = "AND logged_date BETWEEN ? AND ?";
      params.push(start_date, end_date);
    } else {
      // Default to current week
      dateFilter = "AND logged_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)";
    }

    const [[summary]] = await pool.execute(
      `SELECT 
         COUNT(*) AS total_entries,
         ROUND(SUM(hours), 1) AS total_hours,
         ROUND(AVG(hours), 1) AS avg_hours_per_entry,
         COUNT(DISTINCT logged_date) AS days_logged,
         COUNT(DISTINCT project_id) AS projects_count
       FROM activity_logs
       WHERE user_id = ? ${dateFilter}`,
      params
    );

    // Daily breakdown
    const [daily] = await pool.execute(
      `SELECT 
         logged_date AS date,
         ROUND(SUM(hours), 1) AS hours,
         COUNT(*) AS entries
       FROM activity_logs
       WHERE user_id = ? ${dateFilter}
       GROUP BY logged_date
       ORDER BY logged_date DESC`,
      params
    );

    res.json({ summary, daily });
  } catch (err) {
    next(err);
  }
};
