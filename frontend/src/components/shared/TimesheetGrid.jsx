/**
 * TimesheetGrid.jsx
 * Weekly timesheet — click any cell to enter or edit hours inline.
 * Press Enter or click away to save. Press Escape to cancel.
 */

import { useEffect, useMemo, useState } from "react";
import {
  createTimesheetEntry,
  deleteTimesheetEntry,
  updateTimesheetEntry,
  getTimesheetGrid,
} from "../../api";
import { useError } from "../../context/ErrorContext";
import PageSkeleton from "./PageSkeleton";
import styles from "./TimesheetGrid.module.css";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_TYPES = [
  "Billable",
  "Non-billable",
  "Overtime",
  "Holidays",
  "Sick Time",
  "Training",
  "Vacation",
];
const TIME_TYPE_COLORS = {
  "Billable":     "#22c55e",
  "Non-billable": "#6b7280",
  "Overtime":     "#f59e0b",
  "Holidays":     "#ef4444",
  "Sick Time":    "#ef4444",
  "Training":     "#3b82f6",
  "Vacation":     "#8b5cf6",
};

function getWeekDates(weekStart) {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

export default function TimesheetGrid({ weekStart = new Date() }) {
  const { showError } = useError();

  // Derive a stable ISO string for the Monday of the given week.
  // Using a string (primitive) as the useMemo/useEffect dependency prevents
  // infinite re-renders caused by a new Date object reference on every render.
  const mondayISO = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() - (weekStart.getDay() === 0 ? 6 : weekStart.getDay() - 1));
    return d.toISOString().split("T")[0];
  }, [weekStart]);

  const mondayOfWeek = new Date(mondayISO);
  const weekDates = useMemo(() => getWeekDates(mondayOfWeek), [mondayISO]); // eslint-disable-line react-hooks/exhaustive-deps

  const [loading, setLoading]         = useState(false);
  const [data, setData]               = useState({ projects: [] });
  const [saving, setSaving]           = useState(false);
  // editingCell: { subtask_id, date, entryId|null, value, time_type }
  const [editingCell, setEditingCell] = useState(null);

  const loadGrid = async () => {
    setLoading(true);
    try {
      const grid = await getTimesheetGrid({
        date_from: weekDates[0],
        date_to:   weekDates[6],
      });
      setData(grid);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGrid(); }, [weekDates]);

  // ── Save inline edit ────────────────────────────────────────
  const commitEdit = async (cell) => {
    if (!cell) return;
    const hours = parseFloat(cell.value);
    setSaving(true);
    try {
      if (!hours || hours <= 0) {
        // Zero / empty → delete if entry exists
        if (cell.entryId) {
          await deleteTimesheetEntry(cell.entryId);
        }
      } else if (hours > 24) {
        showError("Hours cannot exceed 24");
      } else if (cell.entryId) {
        await updateTimesheetEntry(cell.entryId, {
          hours_logged: hours,
          time_type:    cell.time_type,
        });
      } else {
        await createTimesheetEntry({
          subtask_id:  cell.subtask_id,
          date:        cell.date,
          hours_logged: hours,
          time_type:   cell.time_type,
        });
      }
      await loadGrid();
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
      setEditingCell(null);
    }
  };

  const handleDeleteEntry = async (entryId) => {
    if (!window.confirm("Delete this time entry?")) return;
    try {
      await deleteTimesheetEntry(entryId);
      await loadGrid();
    } catch (err) {
      showError(err.message);
    }
  };

  const weekLabel = `${mondayOfWeek.toLocaleDateString("en-US", {
    month: "short", day: "2-digit",
  })} — ${new Date(weekDates[6]).toLocaleDateString("en-US", {
    month: "short", day: "2-digit",
  })}`;

  // ── Daily column totals ─────────────────────────────────────
  const dailyTotals = weekDates.map((date) =>
    data.projects.reduce(
      (sum, p) =>
        sum +
        p.tasks.reduce(
          (ts, t) =>
            ts +
            t.subtasks.reduce(
              (ss, s) =>
                ss +
                (s.entries
                  ?.filter((e) => e.date === date)
                  .reduce((es, e) => es + Number(e.hours_logged), 0) ?? 0),
              0
            ),
          0
        ),
      0
    )
  );

  if (loading) return <PageSkeleton />;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h2>Weekly Timesheet</h2>
        <div className={styles.weekInfo}>
          <span className={styles.weekLabel}>{weekLabel}</span>
          {saving && (
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Saving…
            </span>
          )}
        </div>
      </div>

      {data.projects && data.projects.length > 0 ? (
        <div className={styles.gridWrapper}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th>Project</th>
                <th>Task</th>
                <th>Subtask</th>
                {DAYS.map((day, i) => (
                  <th key={day} className={styles.dayHeader}>
                    <div className={styles.dayName}>{day}</div>
                    <div className={styles.dayDate}>{weekDates[i]?.slice(5)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.projects.map((project) =>
                project.tasks?.map((task) =>
                  task.subtasks?.map((subtask, idx) => (
                    <tr key={`${subtask.subtask_id}-row`}>
                      {idx === 0 && (
                        <>
                          <td
                            rowSpan={task.subtasks.length}
                            className={styles.projectCell}
                          >
                            {project.project_name}
                          </td>
                          <td
                            rowSpan={task.subtasks.length}
                            className={styles.taskCell}
                          >
                            {task.task_name}
                          </td>
                        </>
                      )}
                      <td className={styles.subtaskCell}>
                        {subtask.subtask_name}
                      </td>

                      {/* Daily cells — click to edit inline */}
                      {weekDates.map((date) => {
                        const dayEntries =
                          subtask.entries?.filter((e) => e.date === date) || [];
                        const totalHours = dayEntries.reduce(
                          (sum, e) => sum + Number(e.hours_logged),
                          0
                        );
                        const firstEntry = dayEntries[0];
                        const isEditing =
                          editingCell?.subtask_id === subtask.subtask_id &&
                          editingCell?.date === date;

                        return (
                          <td
                            key={date}
                            className={styles.dayCell}
                            onClick={() => {
                              if (isEditing || saving) return;
                              setEditingCell({
                                subtask_id: subtask.subtask_id,
                                date,
                                entryId:   firstEntry?.entry_id ?? null,
                                value:     firstEntry
                                  ? String(firstEntry.hours_logged)
                                  : "",
                                time_type:
                                  firstEntry?.time_type ?? "Billable",
                              });
                            }}
                            style={{ cursor: "text" }}
                          >
                            {isEditing ? (
                              /* ── Inline edit UI ── */
                              <div
                                className={styles.inlineEdit}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  autoFocus
                                  type="number"
                                  step="0.25"
                                  min="0"
                                  max="24"
                                  placeholder="0"
                                  value={editingCell.value}
                                  onChange={(e) =>
                                    setEditingCell((prev) => ({
                                      ...prev,
                                      value: e.target.value,
                                    }))
                                  }
                                  className={styles.inlineInput}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                      commitEdit(editingCell);
                                    if (e.key === "Escape")
                                      setEditingCell(null);
                                  }}
                                  onBlur={() => commitEdit(editingCell)}
                                />
                                <select
                                  value={editingCell.time_type}
                                  onChange={(e) =>
                                    setEditingCell((prev) => ({
                                      ...prev,
                                      time_type: e.target.value,
                                    }))
                                  }
                                  className={styles.inlineSelect}
                                  onMouseDown={(e) => e.stopPropagation()}
                                >
                                  {TIME_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : dayEntries.length > 0 ? (
                              /* ── Existing entry display ── */
                              <div className={styles.hoursStack}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: "50%",
                                      flexShrink: 0,
                                      background:
                                        TIME_TYPE_COLORS[
                                          firstEntry?.time_type
                                        ] ?? "#6b7280",
                                    }}
                                  />
                                  <span className={styles.totalHours}>
                                    {totalHours % 1 === 0
                                      ? totalHours
                                      : totalHours.toFixed(2)}
                                    h
                                  </span>
                                </div>
                                <span
                                  style={{
                                    fontSize: "0.6rem",
                                    color: "var(--text-muted)",
                                    lineHeight: 1,
                                  }}
                                >
                                  {firstEntry?.time_type?.substring(0, 4)}
                                </span>
                                {/* Delete button on hover */}
                                {firstEntry && (
                                  <button
                                    className={styles.deleteEntryBtn}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteEntry(firstEntry.entry_id);
                                    }}
                                    title="Delete"
                                    type="button"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ) : (
                              /* ── Empty cell — shows dash, click hint on hover ── */
                              <span className={styles.emptyCell}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )
              )}
            </tbody>
            {/* Daily totals footer */}
            <tfoot>
              <tr>
                <td
                  colSpan={3}
                  style={{
                    padding: "8px 12px",
                    color: "var(--text-muted)",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    background: "var(--bg-surface)",
                    borderTop: "2px solid var(--border-subtle)",
                  }}
                >
                  Daily Total
                </td>
                {dailyTotals.map((total, i) => (
                  <td
                    key={weekDates[i]}
                    style={{
                      padding: "8px 10px",
                      textAlign: "center",
                      fontWeight: 700,
                      fontSize: "0.8125rem",
                      color: total > 0 ? "var(--accent-text)" : "var(--text-muted)",
                      background: "var(--bg-surface)",
                      borderTop: "2px solid var(--border-subtle)",
                    }}
                  >
                    {total > 0
                      ? `${total % 1 === 0 ? total : total.toFixed(1)}h`
                      : "—"}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <p>No subtasks assigned to you for this week.</p>
          <p className={styles.hint}>
            Ask your manager to assign you to a project, or check another week.
          </p>
        </div>
      )}
    </div>
  );
}
