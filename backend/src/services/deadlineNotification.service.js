/**
 * deadlineNotification.service.js
 * Daily cron job that generates deadline notifications for eligible users.
 *
 * Runs at 09:00 AM server time every day.
 * Eligible recipients: admins + project owner + users with assigned subtasks.
 * Deduplication: never creates a duplicate unread notification for same user+project+type.
 */
const pool               = require("../config/db");
const NotificationModel  = require("../models/notification.model");

// ── Threshold → notification type mapping ────────────────────
const THRESHOLDS = [
  { days: 7,  type: NotificationModel.TYPES.DEADLINE_7D },
  { days: 3,  type: NotificationModel.TYPES.DEADLINE_3D },
  { days: 1,  type: NotificationModel.TYPES.DEADLINE_1D },
  { days: 0,  type: NotificationModel.TYPES.DEADLINE_TODAY },
];

// ── Message builders ─────────────────────────────────────────
function buildMessage(type, projectName, daysOverdue = 0) {
  switch (type) {
    case NotificationModel.TYPES.DEADLINE_7D:
      return `⚠️ ${projectName} is due in 7 days. Review progress.`;
    case NotificationModel.TYPES.DEADLINE_3D:
      return `🔴 ${projectName} is due in 3 days. Immediate attention needed.`;
    case NotificationModel.TYPES.DEADLINE_1D:
      return `🚨 ${projectName} is due TOMORROW. Escalate if not on track.`;
    case NotificationModel.TYPES.DEADLINE_TODAY:
      return `🚨 ${projectName} deadline is TODAY.`;
    case NotificationModel.TYPES.DEADLINE_OVERDUE:
      return `❌ ${projectName} is overdue by ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""}. Action required.`;
    default:
      return `Deadline alert for ${projectName}`;
  }
}

/**
 * Get all users eligible to receive notifications for a project.
 * Eligible = admin OR project owner OR has an assigned subtask in the project.
 */
async function getEligibleRecipients(projectId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id, u.name
     FROM users u
     LEFT JOIN user_groups ug ON ug.id = u.group_id
     WHERE u.deleted_at IS NULL
       AND u.status = 'active'
       AND (
         -- Admins always receive notifications
         ug.privilege_level IN ('ADMIN', 'MASTER_ADMIN')
         -- Project owner
         OR u.id IN (SELECT owner_id FROM projects WHERE id = ?)
         -- Users with explicitly assigned subtasks in this project
         OR u.id IN (
           SELECT DISTINCT s.assignee_id
           FROM subtasks s
           JOIN activity_groups ag ON ag.id = s.group_id
           WHERE ag.project_id = ?
             AND s.assignee_id IS NOT NULL
         )
         -- Users who are project owner and have owner-default subtasks
         OR (
           u.id IN (SELECT owner_id FROM projects WHERE id = ?)
           AND EXISTS (
             SELECT 1 FROM subtasks s
             JOIN activity_groups ag ON ag.id = s.group_id
             WHERE ag.project_id = ? AND s.assignee_id IS NULL
           )
         )
       )`,
    [projectId, projectId, projectId, projectId]
  );
  return rows;
}

/**
 * Determine which notification type applies for a given due date.
 * Returns { type, daysOverdue } or null if no threshold matches.
 */
function getNotificationType(dueDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  const diffMs   = due - today;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { type: NotificationModel.TYPES.DEADLINE_OVERDUE, daysOverdue: Math.abs(diffDays) };
  }

  const threshold = THRESHOLDS.find((t) => t.days === diffDays);
  if (threshold) {
    return { type: threshold.type, daysOverdue: 0 };
  }

  return null;
}

/**
 * Main function: generate all deadline notifications for today.
 * Called by the cron job and can also be called manually for testing.
 */
async function generateDailyNotifications() {
  console.log(`[DeadlineNotifications] Starting daily run at ${new Date().toISOString()}`);

  let notificationsCreated = 0;
  let notificationsSkipped = 0;

  try {
    // Get all active projects with a due date set
    const [projects] = await pool.execute(
      `SELECT id, name, due_date, owner_id, status
       FROM projects
       WHERE due_date IS NOT NULL
         AND status NOT IN ('Completed', 'On Hold')
         AND status IS NOT NULL`
    );

    console.log(`[DeadlineNotifications] Checking ${projects.length} active projects`);

    for (const project of projects) {
      const result = getNotificationType(project.due_date);
      if (!result) continue; // No threshold matches today

      const { type, daysOverdue } = result;
      const message = buildMessage(type, project.name, daysOverdue);

      // Get all eligible recipients for this project
      const recipients = await getEligibleRecipients(project.id);

      for (const recipient of recipients) {
        // Deduplication: skip if unread notification of same type already exists
        const alreadyExists = await NotificationModel.exists(recipient.id, project.id, type);
        if (alreadyExists) {
          notificationsSkipped++;
          continue;
        }

        await NotificationModel.create({
          userId:    recipient.id,
          projectId: project.id,
          type,
          message,
        });
        notificationsCreated++;
      }
    }

    console.log(
      `[DeadlineNotifications] Done. Created: ${notificationsCreated}, Skipped (dedup): ${notificationsSkipped}`
    );
  } catch (err) {
    console.error("[DeadlineNotifications] Error during daily run:", err);
    throw err;
  }

  return { notificationsCreated, notificationsSkipped };
}

/**
 * Dismiss all deadline notifications for a project when it's marked Completed.
 * Called from the project update controller.
 */
async function dismissForCompletedProject(projectId) {
  await NotificationModel.dismissForCompletedProject(projectId);
}

module.exports = {
  generateDailyNotifications,
  dismissForCompletedProject,
  getEligibleRecipients,
  buildMessage,
  getNotificationType,
};
