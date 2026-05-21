/**
 * NotificationBell.jsx
 * Bell icon with unread badge + dropdown for deadline notifications.
 * Sorted by urgency: overdue → today → 1d → 3d → 7d
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../../api";
import styles from "./NotificationBell.module.css";

const URGENCY_ORDER = {
  deadline_overdue: 1,
  deadline_today:   2,
  deadline_1d:      3,
  deadline_3d:      4,
  deadline_7d:      5,
};

const TYPE_COLOR = {
  deadline_overdue: "#ef4444",
  deadline_today:   "#ef4444",
  deadline_1d:      "#f97316",
  deadline_3d:      "#f97316",
  deadline_7d:      "#eab308",
};

const TYPE_DOT = {
  deadline_overdue: "🔴",
  deadline_today:   "🔴",
  deadline_1d:      "🟠",
  deadline_3d:      "🟠",
  deadline_7d:      "🟡",
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen]               = useState(false);
  const [notifications, setNotifs]    = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading]         = useState(false);
  const dropRef = useRef(null);

  const fetchNotifs = useCallback(async () => {
    try {
      const data = await getNotifications();
      const sorted = [...(data.notifications ?? [])].sort(
        (a, b) => (URGENCY_ORDER[a.type] ?? 9) - (URGENCY_ORDER[b.type] ?? 9)
      );
      setNotifs(sorted);
      setUnreadCount(data.unread_count ?? 0);
    } catch {
      // silent — bell should never crash the app
    }
  }, []);

  // Initial load + poll every 60 seconds
  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifs]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleMarkAllRead = async () => {
    setLoading(true);
    try {
      await markAllNotificationsRead();
      await fetchNotifs();
    } finally {
      setLoading(false);
    }
  };

  const handleMarkOne = async (e, id) => {
    e.stopPropagation();
    await markNotificationRead(id);
    await fetchNotifs();
  };

  const handleViewAll = () => {
    setOpen(false);
    navigate("/notifications");
  };

  return (
    <div className={styles.wrap} ref={dropRef}>
      {/* Bell button */}
      <button
        className={styles.bell}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
      >
        🔔
        {unreadCount > 0 && (
          <span className={styles.badge}>{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className={styles.dropdown} role="dialog" aria-label="Notifications">
          <div className={styles.dropHeader}>
            <span className={styles.dropTitle}>Notifications</span>
            {unreadCount > 0 && (
              <button
                className={styles.markAllBtn}
                onClick={handleMarkAllRead}
                disabled={loading}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className={styles.list}>
            {notifications.length === 0 ? (
              <div className={styles.empty}>No notifications</div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  className={`${styles.item} ${!n.is_read ? styles.unread : ""}`}
                  style={{ borderLeft: `3px solid ${TYPE_COLOR[n.type] ?? "#6b7280"}` }}
                >
                  <div className={styles.itemTop}>
                    <span className={styles.dot}>{TYPE_DOT[n.type] ?? "⚪"}</span>
                    <span className={styles.projectName}>{n.project_name ?? "Unknown project"}</span>
                    <span className={styles.time}>{timeAgo(n.created_at)}</span>
                    {!n.is_read && (
                      <button
                        className={styles.readBtn}
                        onClick={(e) => handleMarkOne(e, n.id)}
                        title="Mark as read"
                      >
                        ✓
                      </button>
                    )}
                  </div>
                  <div className={styles.message}>{n.message}</div>
                </div>
              ))
            )}
          </div>

          <button className={styles.viewAll} onClick={handleViewAll}>
            View all notifications →
          </button>
        </div>
      )}
    </div>
  );
}
