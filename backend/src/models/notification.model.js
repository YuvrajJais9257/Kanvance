/**
 * notification.model.js
 * User notifications for deadline alerts and system events
 */
const pool = require("../config/db");

// Notification type constants
exports.TYPES = {
  DEADLINE_7D: 'deadline_7d',
  DEADLINE_3D: 'deadline_3d',
  DEADLINE_1D: 'deadline_1d',
  DEADLINE_TODAY: 'deadline_today',
  DEADLINE_OVERDUE: 'deadline_overdue'
};

/**
 * Create a notification
 */
exports.create = async ({ userId, projectId, type, message }) => {
  const [result] = await pool.execute(
    `INSERT INTO notifications (user_id, project_id, type, message)
     VALUES (?, ?, ?, ?)`,
    [userId, projectId || null, type, message]
  );
  return result.insertId;
};

/**
 * Get notifications for a user
 * @param {number} userId
 * @param {Object} options
 * @param {boolean} options.unreadOnly - Only unread notifications
 * @param {string} options.filter - Filter by urgency (overdue, due_soon, read)
 * @param {number} options.limit - Max results
 */
exports.getForUser = async (userId, { unreadOnly = false, filter, limit = 50 } = {}) => {
  let query = `
    SELECT 
      n.*,
      p.name AS project_name,
      p.due_date AS project_due_date,
      c.name AS customer_name
    FROM notifications n
    LEFT JOIN projects p ON p.id = n.project_id
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE n.user_id = ?
  `;
  const params = [userId];

  if (unreadOnly) {
    query += ' AND n.is_read = 0';
  }

  if (filter === 'overdue') {
    query += ` AND n.type = 'deadline_overdue'`;
  } else if (filter === 'due_soon') {
    query += ` AND n.type IN ('deadline_today', 'deadline_1d', 'deadline_3d')`;
  } else if (filter === 'read') {
    query += ' AND n.is_read = 1';
  }

  // Sort by urgency (overdue first), then by date
  query += `
    ORDER BY 
      CASE n.type
        WHEN 'deadline_overdue' THEN 1
        WHEN 'deadline_today' THEN 2
        WHEN 'deadline_1d' THEN 3
        WHEN 'deadline_3d' THEN 4
        WHEN 'deadline_7d' THEN 5
        ELSE 6
      END,
      n.created_at DESC
    LIMIT ?
  `;
  params.push(Number(limit));

  const [rows] = await pool.execute(query, params);
  return rows;
};

/**
 * Get unread count for a user
 */
exports.getUnreadCount = async (userId) => {
  const [[{ count }]] = await pool.execute(
    'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
    [userId]
  );
  return Number(count);
};

/**
 * Get critical notifications (overdue or due today) for banner
 */
exports.getCriticalForUser = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT 
       n.*,
       p.name AS project_name
     FROM notifications n
     LEFT JOIN projects p ON p.id = n.project_id
     WHERE n.user_id = ?
       AND n.is_read = 0
       AND n.type IN ('deadline_overdue', 'deadline_today')
     ORDER BY 
       CASE n.type
         WHEN 'deadline_overdue' THEN 1
         WHEN 'deadline_today' THEN 2
       END,
       n.created_at DESC`,
    [userId]
  );
  return rows;
};

/**
 * Mark a notification as read
 */
exports.markAsRead = async (notificationId, userId) => {
  await pool.execute(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [notificationId, userId]
  );
};

/**
 * Mark all notifications as read for a user
 */
exports.markAllAsRead = async (userId) => {
  await pool.execute(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
    [userId]
  );
};

/**
 * Check if notification already exists (for deduplication)
 */
exports.exists = async (userId, projectId, type) => {
  const [[row]] = await pool.execute(
    `SELECT id FROM notifications 
     WHERE user_id = ? AND project_id = ? AND type = ? AND is_read = 0
     LIMIT 1`,
    [userId, projectId, type]
  );
  return !!row;
};

/**
 * Dismiss all notifications for a deleted project
 */
exports.dismissForProject = async (projectId) => {
  await pool.execute(
    'DELETE FROM notifications WHERE project_id = ?',
    [projectId]
  );
};

/**
 * Dismiss all notifications for a completed project
 */
exports.dismissForCompletedProject = async (projectId) => {
  await pool.execute(
    `DELETE FROM notifications 
     WHERE project_id = ? 
       AND type LIKE 'deadline_%'`,
    [projectId]
  );
};
