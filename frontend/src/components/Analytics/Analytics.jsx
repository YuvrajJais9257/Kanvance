/**
 * Analytics.jsx — KPI Dashboard
 * Surfaces: summary cards, task completion, team utilisation,
 * hours per person per project, blocked tasks, status breakdown.
 * Pure React — no external chart library, uses CSS bar charts.
 */
import { useState, useEffect, useCallback } from "react";
import Sidebar from "../sidebar/Sidebar";
import styles from "./Analytics.module.css";
import {
  getAnalyticsSummary,
  getTaskCompletion,
  getTeamUtilisation,
  getHoursPerPerson,
  getBlockedTasks,
  getStatusBreakdown,
} from "../../api";
import { useError } from "../../context/ErrorContext";
import { useAuth } from "../../context/AuthContext";

const STATUS_COLORS = {
  "Done":              "#22c55e",
  "Completed":         "#22c55e",
  "In Progress":       "#3b82f6",
  "In Testing":        "#14b8a6",
  "Awaiting Feedback": "#f59e0b",
  "Blocked":           "#ef4444",
  "Not Started":       "#6b7280",
};

const PROJECT_STATUS_COLORS = {
  "On Track":   "#22c55e",
  "Completed":  "#14b8a6",
  "At Risk":    "#f59e0b",
  "Delayed":    "#ef4444",
  "On Hold":    "#6b7280",
  "Prospecting":"#a78bfa",
};

// ── Mini bar component ────────────────────────────────────────────────────
function Bar({ pct, color = "#6366f1", height = 8 }) {
  return (
    <div className={styles.barTrack} style={{ height }}>
      <div
        className={styles.barFill}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color, height }}
      />
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = "#6366f1", icon }) {
  return (
    <div className={styles.kpiCard}>
      {icon && <span className={styles.kpiIcon}>{icon}</span>}
      <div className={styles.kpiValue} style={{ color }}>{value ?? "—"}</div>
      <div className={styles.kpiLabel}>{label}</div>
      {sub && <div className={styles.kpiSub}>{sub}</div>}
    </div>
  );
}

const TABS = ["Overview", "Projects", "Team", "Blocked Tasks"];

export default function Analytics() {
  const { showError } = useError();
  const { user }      = useAuth();
  const isMember      = user?.role === "MEMBER";
  const [activeTab, setActiveTab] = useState("Overview");
  const [loading,   setLoading]   = useState(true);

  const [summary,    setSummary]    = useState(null);
  const [completion, setCompletion] = useState([]);
  const [utilisation,setUtilisation]= useState([]);
  const [hoursData,  setHoursData]  = useState([]);
  const [blocked,    setBlocked]    = useState([]);
  const [statusBreak,setStatusBreak]= useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c, u, h, b, sb] = await Promise.all([
        getAnalyticsSummary(),
        getTaskCompletion(),
        getTeamUtilisation(),
        getHoursPerPerson(),
        getBlockedTasks(),
        getStatusBreakdown(),
      ]);
      setSummary(s);
      setCompletion(c);
      setUtilisation(u);
      setHoursData(h);
      setBlocked(b);
      setStatusBreak(sb);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Hours per person grouped by user ─────────────────────────────────
  const hoursByUser = {};
  hoursData.forEach((r) => {
    if (!hoursByUser[r.user_name]) hoursByUser[r.user_name] = [];
    hoursByUser[r.user_name].push(r);
  });

  const maxHours = Math.max(...utilisation.map((u) => Number(u.total_hours) || 0), 1);
  const totalSubtasks = statusBreak.reduce((s, r) => s + Number(r.count), 0);

  return (
    <div>
      <Sidebar />
      <div className={styles.page} style={{ marginLeft: "260px" }}>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Analytics</h1>
            <p className={styles.subtitle}>
              {isMember
                ? "Your assigned projects and tasks"
                : "KPI dashboard — project progress, team utilisation, task health"}
            </p>
          </div>
          <button className={styles.refreshBtn} onClick={load} disabled={loading}>
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>

        {/* Tab bar */}
        <div className={styles.tabBar}>
          {TABS.map((t) => (
            <button
              key={t}
              className={`${styles.tab} ${activeTab === t ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(t)}
            >
              {t}
              {t === "Blocked Tasks" && blocked.length > 0 && (
                <span className={styles.tabBadge}>{blocked.length}</span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className={styles.loading}>Loading analytics…</div>
        ) : (
          <>
            {/* ── Overview tab ──────────────────────────────────────── */}
            {activeTab === "Overview" && summary && (
              <div>
                {/* KPI cards */}
                <div className={styles.kpiGrid}>
                  <KpiCard icon="📁" label="Total Projects"    value={summary.total_projects}    color="#6366f1" />
                  <KpiCard icon="✅" label="Completed"         value={summary.completed_projects} color="#22c55e" />
                  <KpiCard icon="⚠️" label="At Risk"           value={summary.at_risk_projects}   color="#f59e0b" />
                  <KpiCard icon="🔴" label="Delayed"           value={summary.delayed_projects}   color="#ef4444" />
                  <KpiCard icon="📋" label="Total Tasks"       value={summary.total_subtasks}     color="#94a3b8" />
                  <KpiCard icon="🎯" label="Completion Rate"
                    value={`${summary.overall_completion_pct ?? 0}%`}
                    color="#14b8a6"
                    sub={`${summary.done_subtasks} of ${summary.total_subtasks} done`}
                  />
                  <KpiCard icon="🚫" label="Blocked Tasks"     value={summary.blocked_subtasks}   color="#ef4444" />
                  <KpiCard icon="⏱️" label="Hours Logged"      value={summary.total_hours_logged} color="#a78bfa" />
                </div>

                {/* Status breakdown */}
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>Task Status Breakdown</h2>
                  <div className={styles.statusGrid}>
                    {statusBreak.map((s) => {
                      const color = STATUS_COLORS[s.status] ?? "#6b7280";
                      const pct   = totalSubtasks ? Math.round((s.count / totalSubtasks) * 100) : 0;
                      return (
                        <div key={s.status} className={styles.statusRow}>
                          <span className={styles.statusDot} style={{ background: color }} />
                          <span className={styles.statusName}>{s.status}</span>
                          <Bar pct={pct} color={color} height={10} />
                          <span className={styles.statusCount}>{s.count}</span>
                          <span className={styles.statusPct}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── Projects tab ──────────────────────────────────────── */}
            {activeTab === "Projects" && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Project Completion Rates</h2>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Project</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Progress</th>
                        <th>Done</th>
                        <th>Blocked</th>
                        <th>Due Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completion.map((p) => {
                        const psc = PROJECT_STATUS_COLORS[p.project_status] ?? "#6b7280";
                        const pct = Number(p.completion_pct) || 0;
                        return (
                          <tr key={p.project_id}>
                            <td className={styles.customerName}>{p.customer_name}</td>
                            <td>{p.project_name || "—"}</td>
                            <td><span className={styles.typePill}>{p.type}</span></td>
                            <td>
                              <span className={styles.statusBadge}
                                style={{ background: psc + "22", color: psc, border: `1px solid ${psc}44` }}>
                                {p.project_status}
                              </span>
                            </td>
                            <td className={styles.progressCell}>
                              <Bar pct={pct} color={pct >= 100 ? "#22c55e" : pct >= 50 ? "#3b82f6" : "#f59e0b"} height={8} />
                              <span className={styles.pctLabel}>{pct}%</span>
                            </td>
                            <td className={styles.numCell}>{p.done_subtasks ?? 0}/{p.total_subtasks ?? 0}</td>
                            <td className={styles.numCell} style={{ color: "#ef4444" }}>
                              {Number(p.blocked_subtasks) + Number(p.awaiting_subtasks) || 0}
                            </td>
                            <td className={styles.dateCell}>
                              {p.due_date ? new Date(p.due_date).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Team tab ──────────────────────────────────────────── */}
            {activeTab === "Team" && (
              <div>
                {/* Utilisation bars */}
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>Team Utilisation</h2>
                  <div className={styles.utilisationGrid}>
                    {utilisation.map((u) => {
                      const hrs = Number(u.total_hours) || 0;
                      const pct = Math.round((hrs / maxHours) * 100);
                      return (
                        <div key={u.user_id} className={styles.utilisationCard}>
                          <div className={styles.utilisationTop}>
                            <span className={styles.utilisationAvatar}>{u.user_name[0]}</span>
                            <div className={styles.utilisationInfo}>
                              <span className={styles.utilisationName}>{u.user_name}</span>
                              <span className={styles.utilisationRole}>{u.role}</span>
                            </div>
                            <span className={styles.utilisationHours}>{hrs}h</span>
                          </div>
                          <Bar pct={pct} color="#6366f1" height={6} />
                          <div className={styles.utilisationMeta}>
                            <span>{u.projects_worked ?? 0} projects</span>
                            <span>{u.assigned_subtasks ?? 0} tasks</span>
                            <span style={{ color: "#22c55e" }}>{u.completed_subtasks ?? 0} done</span>
                            {Number(u.blocked_subtasks) > 0 && (
                              <span style={{ color: "#ef4444" }}>{u.blocked_subtasks} blocked</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Hours per person per project */}
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>Hours per Person per Project</h2>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Person</th>
                          <th>Customer</th>
                          <th>Project</th>
                          <th>Type</th>
                          <th>Hours</th>
                          <th>Distribution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hoursData.map((r, i) => {
                          const userMax = Math.max(
                            ...hoursData.filter((x) => x.user_name === r.user_name)
                              .map((x) => Number(x.hours_logged)), 1
                          );
                          const pct = Math.round((Number(r.hours_logged) / userMax) * 100);
                          return (
                            <tr key={i}>
                              <td className={styles.personName}>{r.user_name}</td>
                              <td className={styles.customerName}>{r.customer_name}</td>
                              <td>{r.project_name || "—"}</td>
                              <td><span className={styles.typePill}>{r.project_type}</span></td>
                              <td className={styles.numCell}>{r.hours_logged}h</td>
                              <td className={styles.barCell}>
                                <Bar pct={pct} color="#6366f1" height={8} />
                              </td>
                            </tr>
                          );
                        })}
                        {hoursData.length === 0 && (
                          <tr><td colSpan={6} className={styles.empty}>
                            No hours logged yet. Use the Reports page to upload timesheets.
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── Blocked Tasks tab ─────────────────────────────────── */}
            {activeTab === "Blocked Tasks" && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>
                  Blocked &amp; Awaiting Feedback
                  <span className={styles.blockedCount}>{blocked.length}</span>
                </h2>
                {blocked.length === 0 ? (
                  <div className={styles.allClear}>
                    <span className={styles.allClearIcon}>✅</span>
                    <span>No blocked or awaiting-feedback tasks right now.</span>
                  </div>
                ) : (
                  <div className={styles.blockedList}>
                    {blocked.map((b) => {
                      const sc = STATUS_COLORS[b.status] ?? "#6b7280";
                      return (
                        <div key={b.subtask_id} className={styles.blockedCard}>
                          <div className={styles.blockedTop}>
                            <span
                              className={styles.statusBadge}
                              style={{ background: sc + "22", color: sc, border: `1px solid ${sc}44` }}
                            >
                              {b.status}
                            </span>
                            <span className={styles.blockedProject}>
                              {b.customer_name} → {b.group_name}
                            </span>
                            {b.due_date && (
                              <span className={styles.blockedDue}>
                                Due {new Date(b.due_date).toLocaleDateString("en-GB", { day:"2-digit", month:"short" })}
                              </span>
                            )}
                          </div>
                          <div className={styles.blockedName}>{b.subtask_name}</div>
                          {b.flag_type && (
                            <div className={styles.blockedFlag}>
                              <span className={styles.flagType}>⚑ {b.flag_type}</span>
                              {b.flag_reason && <span className={styles.flagReason}>{b.flag_reason}</span>}
                              {b.flag_waiting_on && (
                                <span className={styles.flagWaiting}>Waiting on: {b.flag_waiting_on}</span>
                              )}
                            </div>
                          )}
                          {b.assignee_name && (
                            <div className={styles.blockedAssignee}>
                              Assigned to <strong>{b.assignee_name}</strong>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
