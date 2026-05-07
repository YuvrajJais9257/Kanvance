import { useState, useEffect, useMemo } from "react";
import Sidebar from "../sidebar/Sidebar";
import styles from "./MyTasks.module.css";
import { getTeam, getMyTasks } from "../../api";
import { useError } from "../../context/ErrorContext";
import { useNavigate } from "react-router-dom";
import { useAvailability } from "../../hooks/useAvailability";
import StatusDot from "../StatusDot/StatusDot";

const STATUS_COLOR = {
  "Not Started":       "#6b7280",
  "In Progress":       "#3b82f6",
  "In Testing":        "#14b8a6",
  "Awaiting Feedback": "#f59e0b",
  "Blocked":           "#ef4444",
  "Done":              "#22c55e",
};

const todayLabel = new Intl.DateTimeFormat("en-US", {
  weekday: "short", day: "2-digit", month: "short", year: "numeric",
}).format(new Date());

// F-3 fix: compute urgency dates inside the component render, not at module load time
function getUrgencyDates() {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const in7Days  = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];
  return { todayStr, in7Days };
}

function urgencyClass(task, styles) {
  if (task.status === "Done") return "";
  if (!task.due_date) return "";
  const { todayStr, in7Days } = getUrgencyDates();
  const d = task.due_date.split("T")[0];
  if (d < todayStr)  return styles.overdue;
  if (d <= in7Days)  return styles.dueSoon;
  return "";
}

// Group tasks by project
function groupByProject(tasks) {
  const map = new Map();
  for (const t of tasks) {
    if (!map.has(t.project_id)) {
      map.set(t.project_id, { project_id: t.project_id, customer_name: t.customer_name, tasks: [] });
    }
    map.get(t.project_id).tasks.push(t);
  }
  return [...map.values()];
}

export default function MyTasks() {
  const { showError } = useError();
  const navigate = useNavigate();
  const { statuses } = useAvailability();

  const [team, setTeam]                   = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [tasks, setTasks]                 = useState([]);
  const [loading, setLoading]             = useState(false);

  // Load team on mount
  useEffect(() => {
    getTeam()
      .then((t) => {
        setTeam(t);
        if (t.length > 0) setSelectedMember(t[0]);
      })
      .catch((err) => showError(err.message));
  }, []);

  // Load tasks when member changes
  useEffect(() => {
    if (!selectedMember) return;
    setLoading(true);
    getMyTasks(selectedMember.id)
      .then(setTasks)
      .catch((err) => showError(err.message))
      .finally(() => setLoading(false));
  }, [selectedMember]);

  const grouped = groupByProject(tasks);
  const useTabStrip = team.length <= 6;

  return (
    <div>
      <Sidebar />
      <div className={styles.page}>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>My Tasks</h1>
            <p className={styles.subtitle}>All steps assigned to a team member</p>
          </div>
          <span className={styles.dateStr}>{todayLabel}</span>
        </div>

        {/* F3.8 — Member picker: tab strip ≤6, dropdown if more */}
        <div className={styles.pickerRow}>
          {useTabStrip ? (
            <div className={styles.tabStrip}>
              {team.map((m) => (
                <button
                  key={m.id}
                  className={`${styles.memberTab} ${selectedMember?.id === m.id ? styles.memberTabActive : ""}`}
                  onClick={() => setSelectedMember(m)}
                >
                  <StatusDot status={statuses.get(m.id) ?? "Offline"} size="sm" />
                  <span className={styles.memberAvatar}>{m.name[0]}</span>
                  {m.name}
                </button>
              ))}
            </div>
          ) : (
            <select
              className={styles.memberSelect}
              value={selectedMember?.id ?? ""}
              onChange={(e) => {
                const m = team.find((t) => t.id === Number(e.target.value));
                if (m) setSelectedMember(m);
              }}
            >
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  [{statuses.get(m.id) ?? "Offline"}] {m.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Task list */}
        <div className={styles.content}>
          {loading ? (
            <div className={styles.empty}>Loading…</div>
          ) : tasks.length === 0 ? (
            // F3.12 — empty state
            <div className={styles.empty}>
              No tasks assigned to {selectedMember?.name ?? "this person"} yet.
            </div>
          ) : (
            // F3.9 — grouped by project, then activity group
            grouped.map((proj) => (
              <div key={proj.project_id} className={styles.projectSection}>
                {/* F3.11 — clicking project name navigates to Projects page with that project expanded */}
                <div
                  className={styles.projectName}
                  onClick={() => navigate("/", { state: { expandedProjectId: proj.project_id } })}
                  title="Open in Projects"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate("/", { state: { expandedProjectId: proj.project_id } });
                    }
                  }}
                >
                  {proj.customer_name}
                  <span className={styles.projectArrow}>→</span>
                </div>

                <div className={styles.taskList}>
                  {proj.tasks.map((task) => {
                    const sc    = STATUS_COLOR[task.status] ?? "#6b7280";
                    const urg   = urgencyClass(task, styles);
                    const dStr  = task.due_date ? task.due_date.split("T")[0] : null;

                    return (
                      <div key={task.subtask_id} className={`${styles.taskRow} ${urg}`}>
                        <div className={styles.taskMain}>
                          <div className={styles.taskGroupName}>{task.group_name}</div>
                          <div className={styles.taskName}>{task.subtask_name}</div>
                        </div>

                        <div className={styles.taskMeta}>
                          {/* Status badge */}
                          <span
                            className={styles.statusBadge}
                            style={{ background: sc + "22", color: sc, border: `1px solid ${sc}44` }}
                          >
                            {task.status}
                          </span>

                          {/* Due date */}
                          {dStr && (
                            <span className={`${styles.dueDate} ${urg}`}>
                              {dStr}
                            </span>
                          )}

                          {/* Flag indicator */}
                          {task.flag_type && (
                            <span
                              className={styles.flagBadge}
                              title={`${task.flag_type}${task.flag_reason ? ": " + task.flag_reason : ""}`}
                            >
                              ⚑
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
