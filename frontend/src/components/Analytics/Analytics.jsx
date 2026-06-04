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
  getUserTasks,
} from "../../api";
import { useError } from "../../context/ErrorContext";
import { useAuth } from "../../context/AuthContext";
import PageSkeleton from "../shared/PageSkeleton";
import EmptyState from "../shared/EmptyState";
import Sparkline from "../Dashboard/Sparkline";
import Pagination from "../shared/Pagination";
import { useClientPagination } from "../../hooks/useClientPagination";

const TABLE_PAGE_SIZE = 15;

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
function Bar({ pct, color = "#0ea5e9", height = 8 }) {
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
function KpiCard({ label, value, sub, color = "#0ea5e9", icon, seed = 0 }) {
  return (
    <div className={styles.kpiCard}>
      {icon && <span className={styles.kpiIcon}>{icon}</span>}
      <div className={styles.kpiValue} style={{ color }}>{value ?? "—"}</div>
      <div className={styles.kpiLabel}>{label}</div>
      {sub && <div className={styles.kpiSub}>{sub}</div>}
      <div className={styles.kpiSpark}>
        <Sparkline seed={seed} color={color} />
      </div>
    </div>
  );
}

const TABS = ["Overview", "Projects", "Team", "Blocked Tasks"];

const STATUS_TASK_COLORS = {
  "Done":              "#22c55e",
  "In Progress":       "#3b82f6",
  "In Testing":        "#14b8a6",
  "Awaiting Feedback": "#f59e0b",
  "Blocked":           "#ef4444",
  "Not Started":       "#6b7280",
};

/**
 * Expandable project block inside a utilisation card.
 * Shows project name + customer, total hours, then each task group
 * with its subtasks and logged hours.
 */
function ProjectTaskBlock({ proj }) {
  const [open, setOpen] = useState(false);
  const groups = Object.values(proj.groups);

  return (
    <div className={styles.projBlock}>
      {/* Project row — click to expand tasks */}
      <div
        className={styles.projRow}
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
      >
        <span className={styles.projChevron}>{open ? "▾" : "▸"}</span>
        <span className={styles.projName}>{proj.project_name}</span>
        <span className={styles.projCustomer}>{proj.customer_name}</span>
        <span className={styles.projHours}>
          {proj.totalHours > 0 ? `${proj.totalHours}h` : "—"}
        </span>
      </div>

      {/* Task groups + subtasks */}
      {open && (
        <div className={styles.groupList}>
          {groups.map((grp) => (
            <div key={grp.group_name} className={styles.groupBlock}>
              <div className={styles.groupName}>{grp.group_name}</div>
              <div className={styles.subtaskList}>
                {grp.subtasks.map((s) => {
                  const sc = STATUS_TASK_COLORS[s.subtask_status] ?? "#6b7280";
                  return (
                    <div key={s.subtask_id} className={styles.subtaskRow}>
                      <span
                        className={styles.subtaskDot}
                        style={{ background: sc }}
                        title={s.subtask_status}
                      />
                      <span className={styles.subtaskName}>{s.subtask_name}</span>
                      <span
                        className={styles.subtaskStatus}
                        style={{ color: sc }}
                      >
                        {s.subtask_status}
                      </span>
                      <span className={styles.subtaskHours}>
                        {Number(s.hours_logged) > 0
                          ? `${s.hours_logged}h`
                          : <span style={{ color: "var(--text-muted)" }}>0h</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Analytics() {
  const { showError } = useError();
  const { user }      = useAuth();

  // Effective role = highest of user's own role and their group's privilege_level
  const ROLE_RANK = { MEMBER: 1, MANAGER: 2, ADMIN: 3, MASTER_ADMIN: 4 };
  const effectiveRole = (() => {
    const userRank  = ROLE_RANK[user?.role]                  ?? 1;
    const groupRank = ROLE_RANK[user?.group_privilege_level] ?? 1;
    return userRank >= groupRank ? (user?.role ?? "MEMBER") : user?.group_privilege_level;
  })();
  // isMember = true only when effective role is below ADMIN (data is filtered server-side too)
  const isMember = (ROLE_RANK[effectiveRole] ?? 1) < ROLE_RANK.ADMIN;
  const [activeTab, setActiveTab] = useState("Overview");
  const [loading,   setLoading]   = useState(true);

  const [summary,    setSummary]    = useState(null);
  const [completion, setCompletion] = useState([]);
  const [utilisation,setUtilisation]= useState([]);
  const [hoursData,  setHoursData]  = useState([]);
  const [blocked,    setBlocked]    = useState([]);
  const [statusBreak,setStatusBreak]= useState([]);
  const [userTasks,  setUserTasks]  = useState([]);
  // track which utilisation card is expanded
  const [expandedUser, setExpandedUser] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c, u, h, b, sb, ut] = await Promise.all([
        getAnalyticsSummary(),
        getTaskCompletion(),
        getTeamUtilisation(),
        getHoursPerPerson(),
        getBlockedTasks(),
        getStatusBreakdown(),
        getUserTasks(),
      ]);
      setSummary(s);
      setCompletion(c);
      setUtilisation(u);
      setHoursData(h);
      setBlocked(b);
      setStatusBreak(sb);
      setUserTasks(ut);
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

  // ── User tasks grouped by user → project → task(group) → subtask ─────
  // Shape: { [user_id]: { [project_id]: { project_name, customer_name, tasks: { [group_id]: { group_name, subtasks: [...] } } } } }
  const tasksByUser = {};
  userTasks.forEach((row) => {
    if (!tasksByUser[row.user_id]) tasksByUser[row.user_id] = {};
    const uProj = tasksByUser[row.user_id];
    if (!uProj[row.project_id]) {
      uProj[row.project_id] = {
        project_id:    row.project_id,
        project_name:  row.project_name,
        customer_name: row.customer_name,
        totalHours:    0,
        groups: {},
      };
    }
    const proj = uProj[row.project_id];
    proj.totalHours = Math.round((proj.totalHours + Number(row.hours_logged)) * 10) / 10;
    if (!proj.groups[row.group_id]) {
      proj.groups[row.group_id] = { group_name: row.group_name, subtasks: [] };
    }
    proj.groups[row.group_id].subtasks.push(row);
  });

  const maxHours = Math.max(...utilisation.map((u) => Number(u.total_hours) || 0), 1);
  const totalSubtasks = statusBreak.reduce((s, r) => s + Number(r.count), 0);

  const completionPag = useClientPagination(completion, TABLE_PAGE_SIZE, activeTab);
  const hoursPag = useClientPagination(hoursData, TABLE_PAGE_SIZE, `${activeTab}-hours`);
  const blockedPag = useClientPagination(blocked, TABLE_PAGE_SIZE, `${activeTab}-blocked`);

  return (
    <div>
      <Sidebar />
      <div className={`${styles.page} app-page-scroll`}>

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
          <PageSkeleton variant="analytics" />
        ) : (
          <>
            {/* ── Overview tab ──────────────────────────────────────── */}
            {activeTab === "Overview" && summary && (
              <div>
                {/* KPI cards */}
                <div className={styles.kpiGrid}>
                  <KpiCard seed={1} icon="📁" label="Total Projects"    value={summary.total_projects}    color="#0ea5e9" />
                  <KpiCard seed={2} icon="✅" label="Completed"         value={summary.completed_projects} color="#22c55e" />
                  <KpiCard seed={3} icon="⚠️" label="At Risk"           value={summary.at_risk_projects}   color="#f59e0b" />
                  <KpiCard seed={4} icon="🔴" label="Delayed"           value={summary.delayed_projects}   color="#ef4444" />
                  <KpiCard seed={5} icon="📋" label="Total Tasks"       value={summary.total_subtasks}     color="#94a3b8" />
                  <KpiCard seed={6} icon="🎯" label="Completion Rate"
                    value={`${summary.overall_completion_pct ?? 0}%`}
                    color="#14b8a6"
                    sub={`${summary.done_subtasks} of ${summary.total_subtasks} done`}
                  />
                  <KpiCard seed={7} icon="🚫" label="Blocked Tasks"     value={summary.blocked_subtasks}   color="#ef4444" />
                  <KpiCard seed={8} icon="⏱️" label="Hours Logged"      value={summary.total_hours_logged} color="#a78bfa" />
                </div>

                {/* Status breakdown */}
                <div className={styles.section}>
                  <h2 className={`${styles.sectionTitle} section-heading-accent`}>Task Status Breakdown</h2>
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
                <h2 className={`${styles.sectionTitle} section-heading-accent`}>Project Completion Rates</h2>
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
                      {completionPag.slice.map((p) => {
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
                <Pagination
                  page={completionPag.page}
                  totalPages={completionPag.totalPages}
                  totalItems={completionPag.totalItems}
                  pageSize={TABLE_PAGE_SIZE}
                  onPageChange={completionPag.setPage}
                />
              </div>
            )}

            {/* ── Team tab ──────────────────────────────────────────── */}
            {activeTab === "Team" && (
              <div>
                {/* Utilisation cards */}
                <div className={styles.section}>
                  <h2 className={`${styles.sectionTitle} section-heading-accent`}>Team Utilisation</h2>
                  <div className={styles.utilisationList}>
                    {utilisation.map((u) => {
                      const hrs = Number(u.total_hours) || 0;
                      const pct = Math.round((hrs / maxHours) * 100);
                      const utilizationPct = Number(u.utilization_pct) || 0;
                      const workingHrs  = Number(u.working_hours)  || 0;
                      const billableHrs = Number(u.billable_hours) || 0;
                      const leaveHrs    = Number(u.leave_hours)    || 0;
                      const overtimeHrs = Number(u.overtime_hours) || 0;
                      const isExpanded  = expandedUser === u.user_id;

                      // Projects and tasks for this user
                      const userProjectMap = tasksByUser[u.user_id] || {};
                      const userProjects   = Object.values(userProjectMap);

                      // Role-colored avatar ring
                      const avatarStyle = (u.role === "ADMIN" || u.role === "MASTER_ADMIN")
                        ? { borderColor: "#ef4444", boxShadow: "0 0 0 3px rgba(239,68,68,0.15)" }
                        : u.role === "MANAGER"
                        ? { borderColor: "#f59e0b", boxShadow: "0 0 0 3px rgba(245,158,11,0.15)" }
                        : { borderColor: "#0ea5e9", boxShadow: "0 0 0 3px rgba(14,165,233,0.15)" };

                      return (
                        <div
                          key={u.user_id}
                          className={`${styles.utilisationCard} ${isExpanded ? styles.utilisationCardExpanded : ""}`}
                        >
                          {/* ── Card header — always visible ── */}
                          <div
                            className={styles.utilisationTop}
                            style={{ cursor: "pointer" }}
                            onClick={() => setExpandedUser(isExpanded ? null : u.user_id)}
                            role="button"
                            aria-expanded={isExpanded}
                          >
                            <span className={styles.utilisationAvatar} style={avatarStyle}>
                              {u.user_name[0]}
                            </span>
                            <div className={styles.utilisationInfo}>
                              <span className={styles.utilisationName}>{u.user_name}</span>
                              <span className={styles.utilisationRole}>{u.role}</span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                              <span className={styles.utilisationHours}>{hrs}h</span>
                              {utilizationPct > 0 && (
                                <span style={{ fontSize: "0.6875rem", color: "#22c55e", fontWeight: 700 }}>
                                  {utilizationPct}% billable
                                </span>
                              )}
                            </div>
                            <span className={styles.expandChevron} aria-hidden="true">
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          </div>

                          <Bar pct={pct} color="#0ea5e9" height={6} />

                          {/* Hours breakdown pills */}
                          {(workingHrs > 0 || billableHrs > 0 || leaveHrs > 0 || overtimeHrs > 0) && (
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: "0.6875rem", margin: "2px 0" }}>
                              {workingHrs  > 0 && <span style={{ color: "#3b82f6" }}>⚙ {workingHrs}h working</span>}
                              {billableHrs > 0 && <span style={{ color: "#22c55e" }}>💰 {billableHrs}h billable</span>}
                              {overtimeHrs > 0 && <span style={{ color: "#f59e0b" }}>⏰ {overtimeHrs}h OT</span>}
                              {leaveHrs    > 0 && <span style={{ color: "#6b7280" }}>🌴 {leaveHrs}h leave</span>}
                            </div>
                          )}

                          {/* Summary counts */}
                          <div className={styles.utilisationMeta}>
                            <span>{u.projects_count ?? 0} projects</span>
                            <span>{u.assigned_subtasks ?? 0} tasks</span>
                            <span style={{ color: "#22c55e" }}>{u.completed_subtasks ?? 0} done</span>
                            {Number(u.blocked_subtasks) > 0 && (
                              <span style={{ color: "#ef4444" }}>{u.blocked_subtasks} blocked</span>
                            )}
                          </div>

                          {/* ── Expandable detail ── */}
                          {isExpanded && (
                            <div className={styles.expandBody}>
                              {userProjects.length === 0 ? (
                                <p className={styles.expandEmpty}>No assigned tasks found.</p>
                              ) : (
                                userProjects.map((proj) => (
                                  <ProjectTaskBlock key={proj.project_id} proj={proj} />
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Hours per person per project */}
                <div className={styles.section}>
                  <h2 className={`${styles.sectionTitle} section-heading-accent`}>Hours per Person per Project</h2>
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
                        {hoursPag.slice.map((r, i) => {
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
                                <Bar pct={pct} color="#0ea5e9" height={8} />
                              </td>
                            </tr>
                          );
                        })}
                        {hoursPag.totalItems === 0 && (
                          <tr><td colSpan={6} className={styles.empty}>
                            No hours logged yet. Add time entries in the Timesheet page.
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={hoursPag.page}
                    totalPages={hoursPag.totalPages}
                    totalItems={hoursPag.totalItems}
                    pageSize={TABLE_PAGE_SIZE}
                    onPageChange={hoursPag.setPage}
                  />
                </div>
              </div>
            )}

            {/* ── Blocked Tasks tab ─────────────────────────────────── */}
            {activeTab === "Blocked Tasks" && (
              <div className={styles.section}>
                <h2 className={`${styles.sectionTitle} section-heading-accent`}>
                  Blocked &amp; Awaiting Feedback
                  <span className={styles.blockedCount}>{blocked.length}</span>
                </h2>
                {blocked.length === 0 ? (
                  <EmptyState
                    icon="✅"
                    title="All clear"
                    message="No blocked or awaiting-feedback tasks right now."
                  />
                ) : (
                  <div className={styles.blockedList}>
                    {blockedPag.slice.map((b) => {
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
                {blocked.length > 0 && (
                  <Pagination
                    page={blockedPag.page}
                    totalPages={blockedPag.totalPages}
                    totalItems={blockedPag.totalItems}
                    pageSize={TABLE_PAGE_SIZE}
                    onPageChange={blockedPag.setPage}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
