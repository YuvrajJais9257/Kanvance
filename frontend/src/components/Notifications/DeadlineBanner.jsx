/**
 * DeadlineBanner.jsx
 * Slim critical-only banner at the top of the dashboard.
 * Shows only for overdue or due-today projects.
 * One banner regardless of how many critical projects.
 * Dismissible per session (returns on next login if still unresolved).
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getCriticalNotifications } from "../../api";
import styles from "./DeadlineBanner.module.css";

const SESSION_KEY = "deadline_banner_dismissed";

export default function DeadlineBanner() {
  const navigate = useNavigate();
  const [criticals, setCriticals] = useState([]);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === "true"
  );

  useEffect(() => {
    if (dismissed) return;
    getCriticalNotifications()
      .then(setCriticals)
      .catch(() => {});
  }, [dismissed]);

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, "true");
    setDismissed(true);
  };

  const handleView = () => {
    navigate("/notifications?filter=overdue");
  };

  if (dismissed || criticals.length === 0) return null;

  // Build banner text
  const overdueItems = criticals.filter((n) => n.type === "deadline_overdue");
  const todayItems   = criticals.filter((n) => n.type === "deadline_today");

  let text = "";
  if (overdueItems.length > 0 && todayItems.length > 0) {
    text = `🚨 ${overdueItems.length} project${overdueItems.length > 1 ? "s are" : " is"} overdue and ${todayItems.length} ${todayItems.length > 1 ? "are" : "is"} due today.`;
  } else if (overdueItems.length > 0) {
    if (overdueItems.length === 1) {
      text = `🚨 ${overdueItems[0].project_name} is overdue.`;
    } else {
      text = `🚨 ${overdueItems.length} projects are overdue.`;
    }
  } else if (todayItems.length > 0) {
    if (todayItems.length === 1) {
      text = `🚨 ${todayItems[0].project_name} is due TODAY.`;
    } else {
      text = `🚨 ${todayItems.length} projects are due TODAY.`;
    }
  }

  return (
    <div className={styles.banner} role="alert">
      <span className={styles.text}>{text}</span>
      <button className={styles.viewBtn} onClick={handleView}>
        View →
      </button>
      <button
        className={styles.dismissBtn}
        onClick={handleDismiss}
        aria-label="Dismiss banner"
      >
        ✕
      </button>
    </div>
  );
}
