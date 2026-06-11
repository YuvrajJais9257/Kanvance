/**
 * Timesheet.jsx
 * Weekly timesheet view for logging hours.
 */

import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import PageShell from "../shared/PageShell";
import TimesheetGrid from "../shared/TimesheetGrid";
import Sidebar from "../sidebar/Sidebar";
import styles from "./Timesheet.module.css";

export default function Timesheet() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => {
    // Start from Monday of current week
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
    const monday = new Date(now.setDate(diff));
    return monday;
  });

  const handlePrevWeek = () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    setWeekStart(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(next);
  };

  const handleToday = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
    setWeekStart(new Date(now.setDate(diff)));
  };

  return (
    <div>
      <Sidebar />
      <PageShell>
        <div className={styles.page}>
          {/* Header */}
          <div className={styles.header}>
            <div>
              <h1 className={styles.title}>Weekly Timesheet</h1>
              <p className={styles.subtitle}>Log your hours by task and type</p>
            </div>
            <div className={styles.controls}>
              <button className={styles.navBtn} onClick={handlePrevWeek}>
                ← Previous Week
              </button>
              <button className={styles.todayBtn} onClick={handleToday}>
                This Week
              </button>
              <button className={styles.navBtn} onClick={handleNextWeek}>
                Next Week →
              </button>
            </div>
          </div>

          {/* Timesheet Grid */}
          <div className={styles.gridContainer}>
            <TimesheetGrid weekStart={weekStart} />
          </div>
        </div>
      </PageShell>
    </div>
  );
}
