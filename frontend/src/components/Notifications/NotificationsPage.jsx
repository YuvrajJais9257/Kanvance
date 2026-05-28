/**
 * NotificationsPage.jsx
 * Full notifications list at /notifications
 * Filter tabs: All | Overdue | Due Soon | Read
 * Paginated at 20 items per page
 */
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import Sidebar from "../sidebar/Sidebar";
import PageSkeleton from "../shared/PageSkeleton";
import EmptyState from "../shared/EmptyState";
import Pagination from "../shared/Pagination";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../../api";
import styles from "./NotificationsPage.module.css";

const FILTERS = ["all", "overdue", "due_soon", "read"];
const FILTER_LABELS = { all: "All", overdue: "Overdue", due_soon: "Due Soon", read: "Read" };
const PAGE_SIZE = 20;

const TYPE_COLOR = {
  deadline_overdue: "#ef4444",
  deadline_today:   "#ef4444",
  deadline_1d:      "#f97316",
  deadline_3d:      "#f97316",
  deadline_7d:      "#eab308",
};
const TYPE_LABEL = {
  deadline_overdue: "OVERDUE",
  deadline_today:   "TODAY",
  deadline_1d:      "TOMORROW",
  deadline_3d:      "3 DAYS",
  deadline_7d:      "7 DAYS",
};
const URGENCY_ORDER = {
  deadline_overdue: 1,
  deadline_today:   2,
  deadline_1d:      3,
  deadline_3d:      4,
  deadline_7d:      5,
};

function formatDate(str) {
  if (!str) return "";
  return new Date(str).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function NotificationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = searchParams.get("filter") || "all";

  const [activeFilter, setActiveFilter] = useState(initialFilter);
  const [notifications, setNotifs]      = useState([]);
  const [unreadCount, setUnreadCount]   = useState(0);
  const [loading, setLoading]           = useState(true);
  const [page, setPage]                 = useState(1);
  const [markingAll, setMarkingAll]     = useState(false);

  const fetchNotifs = useCallback(async (filter) => {
    setLoading(true);
    try {
      const data = await getNotifications(filter === "all" ? undefined : filter);
      const sorted = [...(data.notifications ?? [])].sort(
        (a, b) => (URGENCY_ORDER[a.type] ?? 9) - (URGENCY_ORDER[b.type] ?? 9)
      );
      setNotifs(sorted);
      setUnreadCount(data.unread_count ?? 0);
    } catch {
      setNotifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    fetchNotifs(activeFilter);
  }, [activeFilter, fetchNotifs]);

  const handleFilterChange = (f) => {
    setActiveFilter(f);
    setSearchParams(f === "all" ? {} : { filter: f });
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      await fetchNotifs(activeFilter);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleMarkOne = async (id) => {
    await markNotificationRead(id);
    await fetchNotifs(activeFilter);
  };

  // Pagination
  const totalPages = Math.ceil(notifications.length / PAGE_SIZE);
  const paged = notifications.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <Sidebar />
      <div className={`${styles.page} app-page-scroll`}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Notifications</h1>
            <p className={styles.subtitle}>Deadline alerts for your projects</p>
          </div>
          {unreadCount > 0 && (
            <button
              className={styles.markAllBtn}
              onClick={handleMarkAll}
              disabled={markingAll}
            >
              {markingAll ? "Marking…" : `Mark all read (${unreadCount})`}
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className={styles.tabs}>
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`${styles.tab} ${activeFilter === f ? styles.tabActive : ""}`}
              onClick={() => handleFilterChange(f)}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <PageSkeleton variant="list" rows={6} />
        ) : paged.length === 0 ? (
          <EmptyState
            icon="🔔"
            title="No notifications"
            message={
              activeFilter === "all"
                ? "You're all caught up — nothing to show right now."
                : `No ${FILTER_LABELS[activeFilter].toLowerCase()} notifications.`
            }
          />
        ) : (
          <div className={styles.list}>
            {paged.map((n) => {
              const color = TYPE_COLOR[n.type] ?? "#6b7280";
              const label = TYPE_LABEL[n.type] ?? n.type;
              return (
                <div
                  key={n.id}
                  className={`${styles.item} ${!n.is_read ? styles.unread : ""}`}
                  style={{ borderLeft: `3px solid ${color}` }}
                >
                  <div className={styles.itemLeft}>
                    <span
                      className={styles.urgencyBadge}
                      style={{ background: color + "22", color, border: `1px solid ${color}44` }}
                    >
                      {label}
                    </span>
                    <div className={styles.itemBody}>
                      <div className={styles.projectName}>
                        {n.project_name ?? "Unknown project"}
                        {n.customer_name && (
                          <span className={styles.customerName}> · {n.customer_name}</span>
                        )}
                      </div>
                      <div className={styles.message}>{n.message}</div>
                    </div>
                  </div>
                  <div className={styles.itemRight}>
                    <span className={styles.timestamp}>{formatDate(n.created_at)}</span>
                    {!n.is_read && (
                      <button
                        className={styles.readBtn}
                        onClick={() => handleMarkOne(n.id)}
                        title="Mark as read"
                      >
                        ✓ Mark read
                      </button>
                    )}
                    {n.is_read && (
                      <span className={styles.readLabel}>Read</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={notifications.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          className={styles.pagination}
        />
      </div>
    </div>
  );
}
