/**
 * TimesheetGrid.jsx
 *
 * Weekly timesheet grid with:
 *  - Collapsible Project rows (click ▼/▶ to toggle all tasks in a project)
 *  - Collapsible Task (activity group) rows (click ▼/▶ to toggle subtasks)
 *  - Auto-collapse projects with zero hours logged this week on first load
 *  - Collapse All / Expand All toggle in the header
 *  - Sticky Project + Task + Subtask header columns while scrolling right
 *  - Row highlight on hover
 *  - Aggregated task-row hours shown when task is collapsed
 *  - Inline hour editing: click cell → type → Enter/blur to save, Escape to cancel
 *  - Time-type dropdown (select before blurring — won't fire commitEdit prematurely)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createTimesheetEntry,
  deleteTimesheetEntry,
  updateTimesheetEntry,
  getTimesheetGrid,
} from "../../api";
import { useError } from "../../context/ErrorContext";
import PageSkeleton from "./PageSkeleton";
import styles from "./TimesheetGrid.module.css";

const DAYS       = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_TYPES = [
  "Billable", "Non-billable", "Overtime",
  "Holidays", "Sick Time", "Training", "Vacation",
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

function getWeekDates(start) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

/** Sum all hours_logged for a subtask across all entries */
function subtaskWeekTotal(subtask) {
  return (subtask.entries ?? []).reduce((s, e) => s + Number(e.hours_logged), 0);
}

/** Sum all hours for a task group across all its subtasks */
function taskWeekTotal(task) {
  return (task.subtasks ?? []).reduce((s, sub) => s + subtaskWeekTotal(sub), 0);
}

/** Sum hours for a specific date across a task's subtasks */
function taskDateTotal(task, date) {
  return (task.subtasks ?? []).reduce(
    (s, sub) =>
      s +
      (sub.entries ?? [])
        .filter((e) => e.date === date)
        .reduce((es, e) => es + Number(e.hours_logged), 0),
    0
  );
}

export default function TimesheetGrid({ weekStart = new Date() }) {
  const { showError } = useError();

  // ── Stable week dates ──────────────────────────────────────
  const mondayISO = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() - (weekStart.getDay() === 0 ? 6 : weekStart.getDay() - 1));
    return d.toISOString().split("T")[0];
  }, [weekStart]);

  const mondayOfWeek = new Date(mondayISO);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weekDates = useMemo(() => getWeekDates(mondayOfWeek), [mondayISO]);

  // ── Data & UI state ────────────────────────────────────────
  const [loading,     setLoading]     = useState(false);
  const [data,        setData]        = useState({ projects: [] });
  const [saving,      setSaving]      = useState(false);
  const [editingCell, setEditingCell] = useState(null);

  // collapsedProjects: Set of project_id collapsed
  // collapsedTasks:    Set of task_id collapsed
  const [collapsedProjects, setCollapsedProjects] = useState(new Set());
  const [collapsedTasks,    setCollapsedTasks]    = useState(new Set());
  const initialised = useRef(false); // only auto-collapse on first load

  // Prevent commitEdit when focus moves to the time-type select
  const focusingSelectRef = useRef(false);

  // ── Load grid ──────────────────────────────────────────────
  const loadGrid = useCallback(async () => {
    setLoading(true);
    try {
      const grid = await getTimesheetGrid({
        date_from: weekDates[0],
        date_to:   weekDates[6],
      });
      setData(grid);

      // On first load: auto-collapse projects that have zero hours this week
      if (!initialised.current) {
        initialised.current = true;
        const autoCollapse = new Set();
        (grid.projects ?? []).forEach((p) => {
          const total = (p.tasks ?? []).reduce((s, t) => s + taskWeekTotal(t), 0);
          if (total === 0) autoCollapse.add(p.project_id);
        });
        setCollapsedProjects(autoCollapse);
      }
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }, [weekDates]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset initialised flag when week changes so auto-collapse re-runs
  useEffect(() => {
    initialised.current = false;
    loadGrid();
  }, [weekDates]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Collapse helpers ───────────────────────────────────────
  const toggleProject = (pid) =>
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });

  const toggleTask = (tid) =>
    setCollapsedTasks((prev) => {
      const next = new Set(prev);
      next.has(tid) ? next.delete(tid) : next.add(tid);
      return next;
    });

  const allTaskIds = useMemo(
    () => (data.projects ?? []).flatMap((p) => (p.tasks ?? []).map((t) => t.task_id)),
    [data]
  );
  const allProjectIds = useMemo(
    () => (data.projects ?? []).map((p) => p.project_id),
    [data]
  );

  const allCollapsed =
    collapsedProjects.size === allProjectIds.length && allProjectIds.length > 0;

  const handleCollapseAll = () => {
    if (allCollapsed) {
      setCollapsedProjects(new Set());
      setCollapsedTasks(new Set());
    } else {
      setCollapsedProjects(new Set(allProjectIds));
      setCollapsedTasks(new Set(allTaskIds));
    }
  };

  // ── Inline edit: save ──────────────────────────────────────
  const commitEdit = useCallback(async (cell) => {
    if (!cell) return;
    const hours = parseFloat(cell.value);
    setSaving(true);
    try {
      if (!hours || hours <= 0) {
        if (cell.entryId) await deleteTimesheetEntry(cell.entryId);
      } else if (hours > 24) {
        showError("Hours cannot exceed 24");
        return;
      } else if (cell.entryId) {
        await updateTimesheetEntry(cell.entryId, {
          hours_logged: hours,
          time_type:    cell.time_type,
        });
      } else {
        await createTimesheetEntry({
          subtask_id:   cell.subtask_id,
          date:         cell.date,
          hours_logged: hours,
          time_type:    cell.time_type,
        });
      }
      await loadGrid();
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
      setEditingCell(null);
    }
  }, [loadGrid]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteEntry = async (entryId) => {
    if (!window.confirm("Delete this time entry?")) return;
    try {
      await deleteTimesheetEntry(entryId);
      await loadGrid();
    } catch (err) {
      showError(err.message);
    }
  };

  // ── Weekly totals footer ───────────────────────────────────
  const dailyTotals = weekDates.map((date) =>
    (data.projects ?? []).reduce(
      (sum, p) =>
        sum +
        (p.tasks ?? []).reduce(
          (ts, t) =>
            ts +
            (t.subtasks ?? []).reduce(
              (ss, s) =>
                ss +
                (s.entries ?? [])
                  .filter((e) => e.date === date)
                  .reduce((es, e) => es + Number(e.hours_logged), 0),
              0
            ),
          0
        ),
      0
    )
  );

  const weekLabel = `${mondayOfWeek.toLocaleDateString("en-US", { month: "short", day: "2-digit" })} — ${new Date(weekDates[6]).toLocaleDateString("en-US", { month: "short", day: "2-digit" })}`;

  if (loading) return <PageSkeleton />;

  // ── Render a single day cell (reused for subtask rows) ─────
  const renderDayCell = (subtask, date) => {
    const dayEntries  = (subtask.entries ?? []).filter((e) => e.date === date);
    const totalHours  = dayEntries.reduce((s, e) => s + Number(e.hours_logged), 0);
    const firstEntry  = dayEntries[0];
    const isEditing   =
      editingCell?.subtask_id === subtask.subtask_id &&
      editingCell?.date       === date;

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
            value:     firstEntry ? String(firstEntry.hours_logged) : "",
            time_type: firstEntry?.time_type ?? "Billable",
          });
        }}
      >
        {isEditing ? (
          <div className={styles.inlineEdit} onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              type="number"
              step="0.25"
              min="0"
              max="24"
              placeholder="0"
              value={editingCell.value}
              className={styles.inlineInput}
              onChange={(e) =>
                setEditingCell((prev) => ({ ...prev, value: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter")  commitEdit(editingCell);
                if (e.key === "Escape") setEditingCell(null);
              }}
              onBlur={() => {
                if (focusingSelectRef.current) return;
                commitEdit(editingCell);
              }}
            />
            <select
              value={editingCell.time_type}
              className={styles.inlineSelect}
              onChange={(e) => {
                setEditingCell((prev) => ({ ...prev, time_type: e.target.value }));
                focusingSelectRef.current = false;
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                focusingSelectRef.current = true;
              }}
              onBlur={() => {
                focusingSelectRef.current = false;
                commitEdit(editingCell);
              }}
            >
              {TIME_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        ) : totalHours > 0 ? (
          <div className={styles.hoursStack}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: TIME_TYPE_COLORS[firstEntry?.time_type] ?? "#6b7280",
                }}
              />
              <span className={styles.totalHours}>
                {totalHours % 1 === 0 ? totalHours : totalHours.toFixed(2)}h
              </span>
            </div>
            <span style={{ fontSize: "0.6rem", color: "var(--text-muted)", lineHeight: 1 }}>
              {firstEntry?.time_type?.substring(0, 4)}
            </span>
            {firstEntry && (
              <button
                className={styles.deleteEntryBtn}
                onClick={(e) => { e.stopPropagation(); handleDeleteEntry(firstEntry.entry_id); }}
                title="Delete"
                type="button"
              >×</button>
            )}
          </div>
        ) : (
          <span className={styles.emptyCell}>—</span>
        )}
      </td>
    );
  };

  return (
    <div className={styles.container}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <h2 className={styles.title}>Weekly Timesheet</h2>
        <div className={styles.weekInfo}>
          <span className={styles.weekLabel}>{weekLabel}</span>
          {saving && (
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Saving…</span>
          )}
          {(data.projects ?? []).length > 0 && (
            <button
              className={styles.collapseAllBtn}
              onClick={handleCollapseAll}
              title={allCollapsed ? "Expand all" : "Collapse all"}
            >
              {allCollapsed ? "▶ Expand all" : "▼ Collapse all"}
            </button>
          )}
        </div>
      </div>

      {(data.projects ?? []).length > 0 ? (
        <div className={styles.gridWrapper}>
          <table className={styles.grid}>
            {/* ── Column headers ── */}
            <thead>
              <tr>
                <th className={styles.thProject}>Project</th>
                <th className={styles.thTask}>Task</th>
                <th className={styles.thSubtask}>Subtask</th>
                {DAYS.map((day, i) => (
                  <th key={day} className={styles.dayHeader}>
                    <div className={styles.dayName}>{day}</div>
                    <div className={styles.dayDate}>{weekDates[i]?.slice(5)}</div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {(data.projects ?? []).map((project) => {
                const projCollapsed = collapsedProjects.has(project.project_id);
                const projTotal     = (project.tasks ?? []).reduce((s, t) => s + taskWeekTotal(t), 0);

                return [
                  /* ── Project header row ── */
                  <tr
                    key={`proj-${project.project_id}`}
                    className={styles.projectRow}
                    onClick={() => toggleProject(project.project_id)}
                  >
                    <td className={styles.projectCell} colSpan={3}>
                      <span className={styles.chevron}>
                        {projCollapsed ? "▶" : "▼"}
                      </span>
                      <span className={styles.projectName}>{project.project_name}</span>
                      {projCollapsed && projTotal > 0 && (
                        <span className={styles.collapsedHours}>{projTotal.toFixed(projTotal % 1 === 0 ? 0 : 1)}h this week</span>
                      )}
                    </td>
                    {weekDates.map((date) => {
                      const dayTotal = (project.tasks ?? []).reduce(
                        (s, t) => s + taskDateTotal(t, date), 0
                      );
                      return (
                        <td
                          key={date}
                          className={`${styles.dayCell} ${styles.projectDayCell}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {dayTotal > 0 ? (
                            <span className={styles.projDayTotal}>
                              {dayTotal % 1 === 0 ? dayTotal : dayTotal.toFixed(1)}h
                            </span>
                          ) : (
                            <span className={styles.emptyCell}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>,

                  /* ── Task + Subtask rows (hidden when project collapsed) ── */
                  ...(!projCollapsed
                    ? (project.tasks ?? []).flatMap((task) => {
                        const taskCollapsed = collapsedTasks.has(task.task_id);
                        const tTotal        = taskWeekTotal(task);

                        return [
                          /* Task header row */
                          <tr
                            key={`task-${task.task_id}`}
                            className={styles.taskRow}
                            onClick={() => toggleTask(task.task_id)}
                          >
                            <td className={styles.taskIndentCell} />
                            <td className={styles.taskCell} colSpan={2}>
                              <span className={styles.taskChevron}>
                                {taskCollapsed ? "▶" : "▼"}
                              </span>
                              <span className={styles.taskName}>{task.task_name}</span>
                              {taskCollapsed && tTotal > 0 && (
                                <span className={styles.collapsedHours}>
                                  {tTotal.toFixed(tTotal % 1 === 0 ? 0 : 1)}h
                                </span>
                              )}
                            </td>
                            {weekDates.map((date) => {
                              const dt = taskDateTotal(task, date);
                              return (
                                <td
                                  key={date}
                                  className={`${styles.dayCell} ${styles.taskDayCell}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {dt > 0 ? (
                                    <span className={styles.taskDayTotal}>
                                      {dt % 1 === 0 ? dt : dt.toFixed(1)}h
                                    </span>
                                  ) : (
                                    <span className={styles.emptyCell}>—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>,

                          /* Subtask rows */
                          ...(!taskCollapsed
                            ? (task.subtasks ?? []).map((subtask) => (
                                <tr
                                  key={`sub-${subtask.subtask_id}`}
                                  className={styles.subtaskRow}
                                >
                                  <td className={styles.subtaskIndentCell} colSpan={2} />
                                  <td className={styles.subtaskCell}>
                                    {subtask.subtask_name}
                                  </td>
                                  {weekDates.map((date) => renderDayCell(subtask, date))}
                                </tr>
                              ))
                            : []),
                        ];
                      })
                    : []),
                ];
              })}
            </tbody>

            {/* ── Daily totals footer ── */}
            <tfoot>
              <tr className={styles.footerRow}>
                <td colSpan={3} className={styles.footerLabel}>Daily Total</td>
                {dailyTotals.map((total, i) => (
                  <td key={weekDates[i]} className={styles.footerCell}>
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
          <p className={styles.hint}>Ask your manager to assign you to a project, or check another week.</p>
        </div>
      )}
    </div>
  );
}
