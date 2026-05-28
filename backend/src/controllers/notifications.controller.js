/**
 * notifications.controller.js
 * User notifications for deadline alerts
 */
const NotificationModel = require("../models/notification.model");

/**
 * GET /api/notifications
 * Get notifications for the logged-in user
 * Query params: ?filter=overdue|due_soon|read&limit=50
 */
exports.getNotifications = async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const { filter, limit } = req.query;

    const notifications = await NotificationModel.getForUser(userId, {
      filter,
      limit: limit ? Number(limit) : 50
    });

    const unreadCount = await NotificationModel.getUnreadCount(userId);

    res.json({
      notifications,
      unread_count: unreadCount
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/notifications/unread-count
 * Get unread notification count for bell badge
 */
exports.getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const count = await NotificationModel.getUnreadCount(userId);
    res.json({ count });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/notifications/critical
 * Get critical notifications (overdue or due today) for dashboard banner
 */
exports.getCritical = async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const critical = await NotificationModel.getCriticalForUser(userId);
    res.json(critical);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read
 */
exports.markAsRead = async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const notificationId = req.params.id;

    await NotificationModel.markAsRead(notificationId, userId);

    res.json({ success: true, message: "Notification marked as read" });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read for the logged-in user
 */
exports.markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.session.userId;

    await NotificationModel.markAllAsRead(userId);

    res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    next(error);
  }
};
